# SDD: E2E Verifier P1 — 平台化能力补齐

## 目标
让 e2e-verifier 具备批量运行、长期运行、接入流水线的基础能力。

## Slice 1: Job Queue 调度系统

### 背景
当前 verify-server.ts 用内存 map 管理异步 Job，没有持久化、没有优先级、没有并发控制。

### 需要实现

#### 1. Job Queue 核心 (src/scheduler/job-queue.ts)
- `JobQueue` class: 基于 SQLite 的持久化队列（或 JSON 文件）
- Job 生命周期: pending → running → completed / failed / cancelled
- 优先级: high / normal / low
- 并发控制: 最大同时执行 N 个 Job（默认 2）
- FIFO + 优先级排序
- Job 超时自动标记 failed

#### 2. Job Store (src/scheduler/job-store.ts)
- 持久化 Job 状态到 `data/jobs.json` 或 SQLite
- 字段: id, type, config, status, priority, result, error, createdAt, startedAt, completedAt, retryCount
- 查询: by status, by id, list with pagination

#### 3. Scheduler (src/scheduler/scheduler.ts)
- `Scheduler` class: 从 JobQueue 取 Job，分配给 Worker 执行
- Worker 池: 并发控制，每个 Worker 独立 Playwright 浏览器实例
- 事件: onJobStart / onJobComplete / onJobFail
- 启动时恢复 pending/running 状态的 Job

#### 4. API 增强 (src/server/verify-server.ts)
- 现有 /verify, /verify/deep, /verify/orchestrated 改为提交到 JobQueue
- 新增端点:
  - `POST /api/jobs` — 创建 Job（替代各 verify 端点）
  - `GET /api/jobs` — 列表（分页 + 状态筛选）
  - `GET /api/jobs/:id` — 详情（含进度）
  - `DELETE /api/jobs/:id` — 取消 Job
  - `POST /api/jobs/:id/retry` — 重试失败的 Job
  - `POST /api/jobs/batch` — 批量提交（多站点）

#### 5. 触发方式
- CLI 触发: `npm run verify -- --queue` 提交到队列
- API 触发: POST /api/jobs
- 定时触发: 可选 cron-like 配置（暂不实现，留接口）

### 验收
- 提交多个 Job 后按优先级顺序执行
- 并发控制生效（同时最多 N 个 Job）
- 服务重启后 pending Job 不丢失
- 所有现有 CLI/API 功能正常

## Slice 2: 浏览器与设备矩阵

### 需要实现

#### 1. Browser Manager (src/runner/browser-manager.ts)
- 支持启动 Chromium / WebKit / Firefox 三种浏览器
- `getBrowser(type)` → 返回 Browser 实例（lazy init，复用）
- `closeAll()` → 优雅关闭所有浏览器
- 自动安装缺失的浏览器 (`npx playwright install`)

#### 2. Device Matrix 配置
在 SiteConfig 中新增:
```typescript
interface DeviceMatrixConfig {
  browsers?: ('chromium' | 'webkit' | 'firefox')[];
  viewports?: ViewportConfig[];
  locales?: string[];
  userAgent?: string;
}
```

#### 3. Matrix Runner (src/runner/matrix-runner.ts)
- 输入: SiteConfig + DeviceMatrixConfig
- 生成所有组合 (browser × viewport × locale)
- 逐个执行，收集结果
- 输出: MatrixResult { combinations: CombinationResult[], summary: { total, passed, failed } }

#### 4. API 端点
- `POST /api/verify/matrix` — 执行设备矩阵测试
- 结果包含各组合的截图、检查结果、性能指标

### 验收
- 可指定多浏览器运行同一站点
- 结果按 browser/viewport 分组展示
- 现有单浏览器测试不受影响

## Slice 3: Webhook 触发与 CI/CD 集成

### 需要实现

#### 1. Webhook 配置 (src/config/webhook-config.ts)
```typescript
interface WebhookConfig {
  url: string;
  secret: string;
  events: ('job.completed' | 'job.failed' | 'job.started')[];
  enabled: boolean;
}
```

#### 2. Webhook Delivery (src/integrations/webhook.ts)
- Job 完成后触发 Webhook
- HTTP POST + HMAC-SHA256 签名
- Payload: { event, job_id, status, result_summary, timestamp }
- 重试: 3 次，指数退避

#### 3. GitHub Integration (src/integrations/github.ts)
- PR Comment: 在 PR 下评论测试结果摘要
- Commit Status: 设置 commit status (success/failure/pending)
- 使用 GitHub API + token

#### 4. API Token 认证
- 在 server 中添加 API Key 中间件
- `X-API-Key` header 认证
- key 存储在 config 文件中

### 验收
- Job 完成后 Webhook 自动触发
- GitHub PR 收到测试结果评论
- API Key 保护所有端点

## Slice 4: Dashboard 可视化

### 需要实现

#### 1. 简版 Dashboard 页面 (dashboard/)
- 技术栈: 纯 HTML + CSS + Vanilla JS（轻量，不用框架）
- 页面:
  - Job 列表（状态、进度、耗时）
  - 最近报告（通过率趋势图）
  - 站点健康状态卡片
  - 单个报告详情（检查项 + 截图 + 性能）

#### 2. Dashboard API
- `GET /api/dashboard/overview` — 总览数据
- `GET /api/dashboard/sites` — 站点健康状态
- `GET /api/dashboard/trends` — 历史通过率趋势

### 验收
- 浏览器访问能看到 Job 状态和测试结果
- 历史趋势图可渲染

## 执行顺序
1. Slice 1: Job Queue（最核心，其他 slice 依赖它）
2. Slice 2: 浏览器矩阵（独立性高）
3. Slice 3: Webhook/CI（依赖 Job Queue）
4. Slice 4: Dashboard（依赖前面所有 slice 的数据）
