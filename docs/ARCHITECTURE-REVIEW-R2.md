# E2E Verifier — Post-P4 Architecture Code Review (Round 2)

**审查日期**: 2026-06-10 (P4 重构后)
**代码规模**: 32,957 行 TypeScript, 85 个源文件
**对比基准**: P4 重构前 (ARCHITECTURE-REVIEW.md)

---

## ✅ P4 修复确认

| Critical/High 问题 | 修复状态 | 说明 |
|---|---|---|
| 🔴 verify-server.ts 2479 行 God Object | ✅ 已修复 | → 335行 + 10路由(1643行) + 5服务(1081行) |
| 🔴 类型系统分裂 (5 个重复类型) | ✅ 已修复 | 统一到 types/common.ts |
| 🔴 LLMClient 散落 9 处 | ✅ 已修复 | → LLMRegistry 单例 + AgentLoop 保留直接管理 |
| 🟠 Factory 过度使用 | ✅ 已修复 | 8个 Factory 标 @deprecated + lazy init |
| 🔧 双实例启动 bug | ✅ 额外修复 | 删除 verify-server.ts 底部自启动代码 |

## 🟠 High — 仍需修复

### 1. 双 Job 数据源 (Legacy vs New)
**文件**: `src/server/routes/job-routes.ts`

Legacy 端点 (`GET /api/jobs`, `GET /api/jobs/:jobId`) 使用 `verifyService` 的内存 Map。
新端点 (`GET /api/jobs/list`, `GET /api/jobs/:id/detail`) 使用 `jobService` 的 JobQueue/JobStore。

两个数据源：
- `verifyService.jobs`: Map<string, VerificationJob> — 内存中，服务重启丢失
- `jobService` → `JobStore` → `data/jobs.json` — 持久化

**问题**: 一个 Job 可能只在一个数据源存在。API 消费者调 `/api/jobs` 和 `/api/jobs/list` 会得到不同结果。

**修复**: Legacy 端点应该委托给 jobService，或废弃标记。

### 2. `any` 类型滥用 (270 处)
**最严重模块**: intelligence (110 处)

```
src/intelligence: 110 个 any
src/server/routes: 28 个 any
src/engine: 28 个 any
src/ai: 14 个 any
```

典型的有：
- `IntelligenceEvent.data: any` — 应该用 union type
- `TestPlan.metadata.plannerType` 外的其他 metadata 字段全是 `any`
- 多处 `Record<string, any>` 应该用具体接口
- 路由 handler 中 `req.body: any` 应该用 typed request body

**影响**: 类型安全形同虚设，IDE 无法提示，重构风险高。

### 3. Intelligence 与 Legacy 执行路径仍不互通
P4 未触及。两套独立系统并存：
- Legacy: `Verifier` → `checks/*.ts` → Playwright
- Intelligence: `Planner` → `Executor` → `Evaluator` → Playwright

不共享：
- Browser 实例（VerifyServer 一个池，Scheduler 一个池，Executor 各自创建）
- 结果格式（`TestResult` vs `ScenarioResult`）
- 错误分类逻辑

**影响**: 内存浪费（多个 Chromium 实例），维护成本翻倍。

### 4. JSON 文件存储无并发保护
P4 未触及。27 处 readFileSync/writeFileSync 操作 JSON：
- `ExperienceStore` → `data/experiences.json`
- `JobStore` → `data/jobs.json`
- `ProjectStore` → `data/projects.json`
- `ResultStore` → `data/results/{site}/{date}.json`
- `SelfHealing` → `data/locator-cache.json`

高并发下（如 matrix verify 同时写多个结果）可能出现数据丢失。

---

## 🟡 Medium

### 5. 测试覆盖率严重不足
- 全项目仅 3 个测试文件 (720 行)，覆盖 actions/checks/console-monitor
- Intelligence 模块 (19 文件, ~9000 行): **0 测试**
- Server 路由+服务 (15 文件, ~2700 行): **0 测试**
- 核心模块 (verifier, agent-loop, executor): **0 测试**

### 6. 路由层仍有业务逻辑
`verify-service.ts` (577 行) 仍然偏大。部分路由 handler 有 try/catch + 参数校验 + 业务逻辑，职责边界不够清晰。

### 7. Orchestrator lazy init 的 auto-init 模式
`run()` 方法里如果没 `init()` 就自动 init，这隐藏了初始化时机问题。更好的做法是：如果没 init 就 throw，强制调用方显式 init。

### 8. Intelligence 模块内部耦合
`orchestrator.ts` import 了模块内几乎所有其他文件（planner, executor, evaluator, repair-loop, experience-store, experience-planner, self-eval）。这是 orchestrator 的本质（协调者），但意味着测试任何一个组件都需要准备大量 mock。

---

## 📊 架构评分对比

| 维度 | P4 前 | P4 后 | 变化 |
|------|-------|-------|------|
| **模块化** | 4/10 | 7/10 | +3 (verify-server 拆分效果显著) |
| **类型安全** | 5/10 | 6/10 | +1 (消除了重复类型，但 270 个 any) |
| **可测试性** | 3/10 | 4/10 | +1 (lazy init 帮助了一些，但缺测试) |
| **可扩展性** | 6/10 | 7/10 | +1 (routes/services 分层好扩展) |
| **数据层** | 3/10 | 3/10 | 0 (未触及) |
| **代码组织** | 5/10 | 8/10 | +3 (清晰分层) |
| **依赖管理** | 4/10 | 8/10 | +4 (LLMRegistry 收归一处) |
| **综合** | **4.3/10** | **6.1/10** | **+1.8** |

---

## 🎯 P5 修复建议

| 优先级 | 修复项 | 预估工作量 | 收益 |
|--------|--------|-----------|------|
| P0 | 统一 Job 数据源（废弃 legacy 或桥接） | 2h | API 一致性 |
| P1 | 减少 any 使用（至少 intelligence 模块） | 3-4h | 类型安全 |
| P1 | 统一 Browser 实例池 | 2h | 内存优化 |
| P2 | 补核心模块测试 (executor, evaluator) | 4-6h | 信心+回归保护 |
| P2 | JSON 存储 → IStorage 接口 | 3h | 可扩展性 |
