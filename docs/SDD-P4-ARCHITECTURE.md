# SDD: P4 Architecture Refactoring — P0 Critical Fixes

## 目标
修复 ARCHITECTURE-REVIEW.md 中的 3 个 Critical + 2 个 High 问题。

## Slice 1: 拆分 verify-server.ts (Critical #1)

### 目标
将 2479 行的 God Object 拆分为 routes/ + services/ 分层架构。

### 文件结构
```
src/server/
  verify-server.ts              → 精简为 ~200行（Express app + 中间件 + 路由注册）
  routes/
    verify-routes.ts            → /verify/*, /verify/deep, /verify/orchestrated, /verify/matrix, /verify/intelligent, /verify/multi-agent
    job-routes.ts               → /jobs/* 所有端点
    project-routes.ts           → /admin/projects/* 所有端点
    webhook-routes.ts           → /webhooks/* 所有端点
    ai-routes.ts                → /ai/* 所有端点
    dashboard-routes.ts         → /dashboard/* 端点
    trend-routes.ts             → /trends/*, /profiles/* 端点
    key-routes.ts               → /admin/keys/* 端点
    experience-routes.ts        → 已存在，保持
    report-routes.ts            → /reports/* 端点
    health-routes.ts            → /health, /stats 端点
  services/
    verify-service.ts           → 验证业务逻辑（创建 Browser/Verifier/AgentLoop/Orchestrator）
    job-service.ts              → Job 调度业务逻辑（JobQueue/Scheduler 操作）
    project-service.ts          → 项目管理业务逻辑（ProjectStore 操作）
    ai-service.ts               → AI 相关业务逻辑（Provider/Generator/SelfHealing）
    storage-service.ts          → 趋势/质量/结果存储逻辑
```

### 设计原则
- 每个路由文件只做参数提取 + 调用 service + 格式化响应
- 每个 service 持有相关依赖（Store/Queue 等），提供业务方法
- VerifyServer 构造函数只做：创建 Express app + 实例化 services + 注册 routes
- 所有路由通过构造函数注入 service，不直接访问底层依赖
- 保持所有现有 API 端点和行为不变

## Slice 2: 统一类型系统 (Critical #2)

### 目标
消除 5 个同名不同义的重复类型，建立清晰的类型层级。

### 类型重构
```
src/types/
  index.ts          → 保留：SiteConfig, TestResult, CheckResult, ReportData, PerformanceMetrics 等（全局共享基础类型）
  common.ts         → 新建：统一后的 FailureCategory, Evidence, Artifact, ArtifactType, ChatMessage
  agent.ts          → 重命名自 src/agent/types.ts（AgentConfig, AgentResult, AgentStep 等）
  intelligence.ts   → 重命名自 src/intelligence/types.ts（TestTarget, TestPlan, ScenarioResult 等）
  scheduler.ts      → 重命名自 src/scheduler/types.ts（Job, JobConfig 等）
```

### 具体合并规则

**FailureCategory**: 采用 intelligence 版本（更完整 7 种），src/types/index.ts 改为 re-export
```typescript
// src/types/common.ts
export type FailureCategory = 'environment' | 'infrastructure' | 'page_bug' | 'script_issue' | 'data_issue' | 'flaky' | 'unknown';

// src/types/index.ts
export type { FailureCategory } from './common'; // re-export
```

**Evidence**: 合并为完整版
```typescript
export interface Evidence {
  console?: ConsoleError[];
  network?: FailedRequest[];
  trace?: string;
  screenshot?: string;
  domSnapshot?: string;
  performanceMetrics?: PerformanceMetrics;
  additional?: Record<string, any>;
}
```

**Artifact**: 合并（intelligence 版本更完整）
```typescript
export interface Artifact {
  type: ArtifactType;
  path: string;
  timestamp: string;
  size?: number;
  metadata?: Record<string, any>;
}
```

**ArtifactType**: 合并（去重 + 补充 har）
```typescript
export type ArtifactType = 'screenshot' | 'trace' | 'console-log' | 'network-log' | 'dom-snapshot' | 'video' | 'performance-metrics' | 'har';
```

**AssertionType**: 合并（intelligence 版本 14 种更完整）
```typescript
export type AssertionType = 'element-exists' | 'element-visible' | 'element-count' | 'text-contains' | 'text-equals' | 'attribute-equals' | 'attribute-contains' | 'url-matches' | 'title-equals' | 'javascript' | 'performance' | 'accessibility' | 'console' | 'network';
```

**ChatMessage**: 统一为一个定义
```typescript
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

### 迁移策略
1. 创建 src/types/common.ts 放统一类型
2. src/types/index.ts 改为 re-export common.ts + 保留不冲突的独有类型
3. src/intelligence/types.ts 删除重复类型，从 ../types/common 导入
4. src/agent/types.ts 删除 ChatMessage，从 ../types/common 导入
5. src/ai/provider.ts 删除 ChatMessage，从 ../types/common 导入
6. src/agent/llm-client.ts 删除 ChatMessage，从 ../types/common 导入
7. 全局搜索确保无遗漏

## Slice 3: 统一 LLMClient 入口 (Critical #3)

### 目标
9 处 `new LLMClient()` 收归一处，统一管理。

### 设计
```typescript
// src/llm/llm-registry.ts
export class LLMRegistry {
  private static instance: LLMRegistry;
  private config: LLMConfig;
  
  static initialize(config: LLMConfig): void;
  static getInstance(): LLMRegistry;
  
  createClient(options?: Partial<LLMConfig>): LLMClient;
  getConfig(): LLMConfig;
}

export interface LLMConfig {
  apiKey: string;
  apiBase: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}
```

### 迁移
- 所有 `new LLMClient({...})` 改为 `LLMRegistry.getInstance().createClient({ overrides })`
- server 启动时 `LLMRegistry.initialize(config)` 
- Intelligence 模块的 Factory 不再需要传 llm 配置
- ai/provider.ts 的 GLMProvider/OpenAIProvider 使用 LLMRegistry

## Slice 4: 简化 Factory + 依赖注入 (High #4)

### 目标
去掉无意义的 Factory 包装，简化 Orchestrator 构造函数。

### 设计
```typescript
// 简化前
const orchestrator = OrchestratorFactory.create({ ... });

// 简化后
const orchestrator = new IntelligentOrchestrator({
  planner: new LLMPlanner({ ... }),
  executor: new PlaywrightExecutor({ ... }),
  evaluator: new MultiStrategyEvaluator({ ... }),
  // ...
});
```

- 去掉 `PlannerFactory`, `ExecutorFactory`, `EvaluatorFactory`, `RepairLoopFactory` 等
- 保留 `OrchestratorFactory.fromEnv()` 但拆出 `parseEnvConfig()` 函数
- Orchestrator 构造函数接受已创建的组件，不做内部 new

## 执行顺序
1. Slice 2: 统一类型系统（其他 slice 依赖此）
2. Slice 3: 统一 LLMClient 入口
3. Slice 1: 拆分 verify-server.ts（最大的改动）
4. Slice 4: 简化 Factory
