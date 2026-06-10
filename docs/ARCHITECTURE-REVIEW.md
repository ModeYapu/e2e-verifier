# E2E Verifier — Architecture Code Review

**审查日期**: 2026-06-10
**代码规模**: 32,154 行 TypeScript, 81 个源文件
**审查范围**: P0-P3 全部代码，重点架构层面

---

## 🔴 Critical (必须修复)

### 1. verify-server.ts 是 2479 行的 God Object
**文件**: `src/server/verify-server.ts` (2479行)

一个文件承担了 HTTP Server + 全部路由 + 业务逻辑 + 50+ 端点。这是整个项目最大的架构债。

**具体问题**:
- 所有路由处理方法（`postFastVerify`, `postDeepVerify`, `postMatrixVerify`, `postIntelligentVerify`, `postMultiAgentVerify`, `createProject`, `listProjects`...）全在一个 class 里
- 每个 handler 方法直接操作 scheduler/orchestrator/store，没有 Service 层
- constructor 里初始化了 ~20 个依赖（Browser、Verifier、AgentLoop、Scheduler、JobStore、ProjectStore、IntelligentOrchestrator、ResultStore、TrendAnalyzer、QualityProfileCalculator、AIProvider、SelfHealingLocator、SmartTestGenerator、MultiAgentOrchestrator...）
- 新增功能只能往这个文件加，无法独立开发

**修复方案**:
```
src/server/
  verify-server.ts          → 只负责 Express app 创建、中间件挂载、路由注册 (~200行)
  routes/
    verify-routes.ts        → /verify/* 端点
    job-routes.ts           → /jobs/* 端点  
    project-routes.ts       → /admin/projects/* 端点
    webhook-routes.ts       → /webhooks/* 端点
    ai-routes.ts            → /ai/* 端点
    dashboard-routes.ts     → /dashboard/* 端点
    trend-routes.ts         → /trends/*, /profiles/* 端点
    experience-routes.ts    → 已存在 ✅
  services/
    verify-service.ts       → 验证业务逻辑
    job-service.ts          → Job 调度业务逻辑
    project-service.ts      → 项目管理业务逻辑
```

### 2. 类型系统严重分裂
**文件**: `src/types/index.ts`, `src/intelligence/types.ts`, `src/agent/types.ts`

三套独立的类型系统，存在 5 个同名但不同定义的重复类型：

| 类型 | src/types | src/intelligence/types | 冲突 |
|------|-----------|----------------------|------|
| `FailureCategory` | 5 种 | 7 种（多了 page_bug, script_issue, data_issue, flaky） | **值不同** |
| `Evidence` | console/network/trace | screenshot/domSnapshot/performance | **字段不同** |
| `Artifact` | type+path+timestamp | type+path+timestamp+size+metadata | **结构不同** |
| `AssertionType` | 7 种 | 14 种 | **范围不同** |
| `ArtifactType` | 7 种 | 8 种（多了 har） | **范围不同** |

还有 `ChatMessage` 在 3 个文件各定义了一次（`src/ai/provider.ts`, `src/agent/llm-client.ts`, `src/agent/types.ts`）。

**修复方案**:
```
src/types/
  index.ts          → 全局共享基础类型（TestResult, SiteConfig, CheckResult 等）
  intelligence.ts   → Intelligence 模块特有类型（从 intelligence/types.ts 迁移）
  agent.ts          → Agent 模块特有类型（从 agent/types.ts 迁移）
  common.ts         → 统一的 FailureCategory, Evidence, Artifact, ChatMessage 等
```
关键原则：同名类型必须合并。如果确实需要不同定义，用不同的名字（如 `IntelligenceFailureCategory` vs `BasicFailureCategory`）。

### 3. LLMClient 到处 new，没有统一入口
**涉及文件**: 9 处 `new LLMClient()`

LLMClient 在 9 个文件中各自实例化，各自传 apiKey/apiBase/model：
- `agent/agent-loop.ts`
- `intelligence/planner.ts`
- `intelligence/evaluator.ts`
- `intelligence/repair-loop.ts`
- `intelligence/multi-test-orchestrator.ts`
- `ai/provider.ts`（GLMProvider 里还动态 import 再 new）
- `engine/agent-planner.ts`
- `explorer/test-generator.ts`

**问题**:
- apiKey 散落在各模块，改一次要改 9 处
- 无法全局切换模型/提供商
- 无法统一 token 用量统计
- 每个 module 对 LLMClient 构造参数理解不一致（有的需要 maxSteps，有的不需要）

**修复方案**: 
引入 `LLMProviderFactory`，全局单例，所有模块通过 DI 或全局配置获取 LLMClient 实例。

---

## 🟠 High (应该修复)

### 4. Intelligence 模块过度使用 Factory 模式
**文件**: `intelligence/*.ts`

每个组件都有 `XxxFactory.create()`:
- `PlannerFactory.create()`
- `ExecutorFactory.createPlaywright()`
- `EvaluatorFactory.create()`
- `RepairLoopFactory.create()`
- `ExperienceStoreFactory.create()`
- `ExperienceGuidedPlannerFactory.create()`
- `SelfEvalEngineFactory.create()`
- `OrchestratorFactory.create()` / `fromEnv()` / `createSimple()`

但大部分 Factory 只是 `new Xxx(...)` 的一行包装，没有提供真正的价值（如依赖注入、策略选择、配置解析）。特别是 `OrchestratorFactory.fromEnv()` 有 100+ 行的环境变量解析，混合了工厂职责和配置职责。

**修复方案**: 
用配置对象 + constructor 直接创建。`fromEnv()` 提取为独立的 `createConfigFromEnv()` 函数。

### 5. Intelligence 模块与 Legacy 模块并行存在
**问题**: 存在两套完全独立的测试执行路径：

**Legacy 路径** (P0):
```
Verifier → checks/*.ts → 直接 Playwright
AgentLoop → LLM → ScriptEngine → Playwright
VerifyOrchestrator → Verifier + AgentLoop
```

**Intelligence 路径** (P2-P3):
```
IntelligentOrchestrator → Planner → Executor → Evaluator → RepairLoop
```

两套路径：
- 不共享结果格式（`TestResult` vs `ScenarioResult`）
- 不共享执行引擎（`Verifier` 用自己的 Playwright，`Executor` 用自己的）
- 不共享错误处理（`FailureCategory` 定义不同）
- API 端点也是分开的（`/verify` vs `/verify/intelligent`）

**修复方案**: 
统一执行引擎。`Intelligence.Executor` 应该内部使用 `Verifier` 或至少共享 Playwright 管理逻辑。结果格式需要一个 adapter 层。

### 6. 数据存储全部用 JSON 文件
**涉及**: `data/*.json`, `data/experiences.json`, `data/projects.json`, `data/results/`, `scheduler/jobs.json`

没有数据库，全部是 JSON 文件读写：
- `ExperienceStore` → `data/experiences.json`
- `ProjectStore` → `data/projects.json`
- `ResultStore` → `data/results/{site}/{date}.json`
- `JobStore` → `scheduler/jobs.json`
- `SelfHealing` → `data/locator-cache.json`

**问题**:
- 并发读写无保护（多请求同时写 experiences.json 会丢数据）
- 随数据增长性能线性下降（experiences.json 要全量读入内存再做相似度计算）
- 无法做复杂查询
- `ProjectStore` 和 `JobStore` 自行实现了文件锁/追加写，各自不同

**修复方案**: 
至少用 SQLite（项目已有 `better-sqlite3` 作为 Playwright 依赖）。或者抽象 `IStorage` 接口，当前 JSON 实现作为 `JsonStorage`，后续可替换为 `SqliteStorage`。

### 7. Orchestrator 构造函数做了太多事
**文件**: `src/intelligence/orchestrator.ts` constructor

构造函数里：
1. 创建 Planner（可能用 ExperienceGuidedPlanner 替换）
2. 创建 Executor
3. 创建 Evaluator
4. 创建 RepairLoop
5. 创建 ExperienceStore（读文件）
6. 创建 ExperienceGuidedPlanner（替换原来的 planner）
7. 创建 SelfEvalEngine
8. 打印日志

**问题**: 
- 无法延迟初始化（启动就要读 experiences.json）
- 无法部分启用（全部 enabled 或全部 disabled）
- 测试困难（mock 整个依赖树）

**修复方案**: 
Lazy initialization + 明确的 `init()` 方法。

---

## 🟡 Medium (建议修复)

### 8. checks/ 模块与 Intelligence 层没有桥接
**文件**: `src/checks/*.ts`, `src/intelligence/evaluator.ts`

P0 的 `checks/` 模块（accessibility, console, network, performance, seo, visual-regression）是独立的检查模块，被 `Verifier` 直接调用。

P2 的 `Evaluator`（特别是 `MultiStrategyEvaluator`）有自己的验证逻辑但完全不使用已有的 checks。CrossReferenceStrategy 本应引用已有的 performance/console 检查结果，但实际上是独立重新分析。

### 9. ContextManager 和 ContextCompactor 并存
**文件**: `src/intelligence/context-manager.ts`, `src/agent/context-compactor.ts`

两个上下文压缩/管理组件并存，职责重叠但接口不同：
- `ContextCompactor`: Agent Loop 的对话历史压缩
- `ContextManager`: Intelligence 层的上下文管理（5 大能力）

应该统一，至少 `ContextManager` 应该内含或替代 `ContextCompactor`。

### 10. Explorer 和 Intelligence 的 Test Generator 重复
**文件**: `src/explorer/test-generator.ts` (662行), `src/ai/test-generator.ts` (501行)

两个独立的"测试生成器"：
- `explorer/test-generator.ts`: 基于 Explorer 发现生成 Playwright 脚本
- `ai/test-generator.ts`: 基于 AI 分析 URL 生成 sites/*.json 配置

职责不同但概念重叠，应该有统一的 `ITestGenerator` 接口。

### 11. 缺少统一的错误处理层
项目没有全局错误类型体系。各模块各自用 `Error` 或 `string` 或返回 `null`：
- `ExperienceStore` 内部 `try/catch` + `console.error` + 静默失败
- `Executor` 抛出原始 Error
- `Evaluator` 把错误包装在 `EvaluationResult.issues` 里
- API 层有全局错误中间件但不区分错误类型

---

## 📊 架构评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **模块化** | 4/10 | Intelligence 模块内部分层好，但与 Legacy 完全并行不互通 |
| **类型安全** | 5/10 | 有类型但分裂严重，同名不同义 |
| **可测试性** | 3/10 | Factory 模式掩盖了硬依赖，构造函数做了太多事 |
| **可扩展性** | 6/10 | Strategy 模式用得好（Evaluator/Provider），但 verify-server 是瓶颈 |
| **数据层** | 3/10 | 全 JSON 文件，无并发保护，不可 scale |
| **代码组织** | 5/10 | 目录结构清晰但 verify-server 破坏了分层 |
| **依赖管理** | 4/10 | LLMClient 散落 9 处，ChatMessage 定义 3 次 |
| **综合** | **4.3/10** | 功能完整度高，但架构债需要系统化清理 |

---

## 🎯 修复优先级建议

| 优先级 | 修复项 | 预估工作量 | 收益 |
|--------|--------|-----------|------|
| P0 | 拆分 verify-server.ts | 2-3h | 开发效率+可维护性 |
| P0 | 统一类型系统 | 3-4h | 消除类型冲突+减少 bug |
| P0 | 统一 LLMClient 入口 | 1-2h | 安全+可维护 |
| P1 | 抽象 IStorage 接口 | 2-3h | 数据层可扩展 |
| P1 | 统一 Legacy/Intelligence 执行路径 | 3-4h | 消除重复逻辑 |
| P2 | 简化 Factory 模式 | 1h | 代码简洁 |
| P2 | 统一错误处理 | 1-2h | 可调试性 |
