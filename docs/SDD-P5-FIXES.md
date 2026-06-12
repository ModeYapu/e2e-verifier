# SDD: P5 Architecture Fixes — Round 2 Issues

## Slice 1: 统一 Job 数据源

### 问题
Legacy 端点 (`GET /api/jobs`, `GET /api/jobs/:jobId`, `DELETE /api/jobs/:jobId`) 使用 `verifyService` 的内存 Map。
新端点使用 `jobService` 的 JobStore/JobQueue。数据不一致。

### 修复
- Legacy 端点委托给 jobService，不再用 verifyService 的内存 Map
- 删除 verifyService 中的 `jobs` Map 及相关方法 (getJob, deleteJob, listJobs)
- 保留 legacy 路由路径不变，但底层统一到 JobStore
- 修复 `/api/jobs/list` 空列表返回正常

## Slice 2: 减少 any 类型

### 目标
将 intelligence 模块的 110 个 any 减少到 <30 个。

### 重点文件
- src/intelligence/types.ts: IntelligenceEvent.data → 用 union type
- src/intelligence/orchestrator.ts: config 对象的 any → 具体接口
- src/intelligence/evaluator.ts: LLM response 处理的 any
- src/intelligence/experience-types.ts: meta/strategy 字段
- src/server/routes/*.ts: req.body → typed request interfaces

## Slice 3: 统一 Browser 实例池

### 问题
3 处独立创建 Browser 实例：
1. VerifyServer constructor → chromium.launch()
2. Scheduler → BrowserManager 自己的池
3. PlaywrightExecutor → 每次执行 chromium.launch()

### 修复
- 创建全局 BrowserPool 单例 (src/browser/browser-pool.ts)
- VerifyServer/Scheduler/Executor 共享同一个池
- lazy 初始化，按需创建 Browser 实例
- 支持 maxInstances 配置

## Slice 4: JSON 存储并发保护

### 修复
- 抽象 IStorage 接口
- JsonStorage 实现加文件锁 (proper-lockfile 或 write-then-rename)
- 对 ExperienceStore, ProjectStore, JobStore 统一使用
- ResultStore 的追加写操作加锁
