# SDD: E2E Verifier P2 — 智能编排与产品化

## 目标
从"执行框架"升级为"验证平台"，实现 Planner/Executor/Evaluator 分层、历史趋势分析、可插拔 AI 能力。

## Slice 1: Planner / Executor / Evaluator 分层

### 背景
当前 AgentLoop 耦合了规划、执行和评估。需要拆分为独立层，让 AI 能力可插拔。

### 需要实现

#### 1. Test Planner (src/intelligence/planner.ts)
- 输入: 测试目标描述（自然语言或结构化配置）
- 输出: TestPlan { scenarios: Scenario[] }
- 每个 Scenario: { name, steps: Step[], assertions: Assertion[] }
- Planner 接口: `plan(target: TestTarget): Promise<TestPlan>`
- LLM 实现: 用 LLM 分析站点结构，生成测试计划
- 静态实现: 从 sites/*.json 配置直接生成（不依赖 LLM）

#### 2. Test Executor (src/intelligence/executor.ts)
- 输入: Scenario（来自 Planner 的输出）
- 输出: ScenarioResult { passed, steps: StepResult[], artifacts }
- 纯执行，不做决策
- 管理 Playwright 浏览器实例
- 收集截图、console log、network log 等证据
- 重试策略: 失败步骤可重试 N 次

#### 3. Test Evaluator (src/intelligence/evaluator.ts)
- 输入: ScenarioResult
- 输出: EvaluationResult { verdict, confidence, reasoning, suggestions }
- 判断结果是否可信（排除 flaky）
- 失败归因: 环境问题 / 页面 Bug / 测试脚本问题 / 数据问题
- 给出修复建议
- LLM 实现: 多模态分析截图+log 判断根因
- 规则实现: 基于 heuristics 的快速评估（不依赖 LLM）

#### 4. Repair Loop (src/intelligence/repair-loop.ts)
- 当 Evaluator 判定测试脚本问题时，自动修复
- 流程: 执行 → 评估 → 修复 → 重新执行（最多 N 轮）
- 修复策略: 重新生成定位器 / 调整等待时间 / 修改断言
- 修复历史记录，避免重复修复

#### 5. 统一编排 (src/intelligence/orchestrator.ts)
- `run(target, options)`: Planner → Executor → Evaluator → (Repair → Executor → Evaluator)
- 支持配置: 使用 LLM 还是纯规则 / 是否启用 repair loop / 最大轮次
- 事件: onPlan / onExecute / onEvaluate / onRepair

#### 6. API 端点
- POST /api/verify/intelligent — 智能验证（使用完整 Planner→Executor→Evaluator 流程）
- 集成到 Job Queue 作为新 job type: `intelligent`

### 验收
- 拆分后现有功能不受影响
- 可选择是否启用 LLM（纯规则模式也能工作）
- Repair loop 能自动修复简单问题（如元素定位器变更）

## Slice 2: 历史趋势与质量画像

### 需要实现

#### 1. Result Store (src/storage/result-store.ts)
- 持久化每次测试结果到 data/results/ 目录
- 按站点+日期组织: data/results/{siteName}/{date}.json
- 方法: save(result), getBySite(site, range), getByDate(date), getAggregated(site, period)

#### 2. Trend Analyzer (src/storage/trend-analyzer.ts)
- 同站点历史通过率计算
- 回归检测: 对比最近 N 次与历史均值
- 常见失败模式聚类: 按 error message 分组统计
- 环境对比: 同一站点不同浏览器/视口的表现差异

#### 3. Quality Profile (src/storage/quality-profile.ts)
- 每个站点的质量画像:
  - 整体健康分 (0-100)
  - 各维度得分: 性能 / 可访问性 / SEO / 功能正确性
  - 最近趋势: 改善 / 稳定 / 恶化
  - 风险项列表

#### 4. API 端点
- GET /api/trends/{site} — 历史趋势数据
- GET /api/trends/{site}/regressions — 回归检测
- GET /api/profiles — 所有站点质量画像
- GET /api/profiles/{site} — 单站点详情

#### 5. Dashboard 增强
- 趋势图: 通过率折线图 + 回归标记
- 站点健康卡片: 颜色编码（绿/黄/红）
- 失败模式热力图

### 验收
- 测试结果自动持久化
- 可查询任意站点的历史趋势
- 质量画像自动计算

## Slice 3: 多租户与项目隔离

### 需要实现

#### 1. Project 概念
- projects.json: { id, name, apiKey, sites[], members[], createdAt }
- 每个测试站点属于一个项目
- API Key 认证 → 关联到项目 → 只能访问该项目资源

#### 2. 数据隔离
- Results 按项目隔离
- Jobs 按项目隔离
- API 查询自动加 project 过滤

#### 3. 管理 API
- CRUD /api/admin/projects
- API Key 管理
- 成员管理

### 验收
- 不同 API Key 看到不同数据
- Admin 可管理所有项目

## Slice 4: 可插拔 AI 与高级能力

### 需要实现

#### 1. AI Provider 抽象 (src/ai/provider.ts)
- AIProvider 接口: chat(messages) → response, analyzeImage(image, prompt) → response
- 实现: GLMProvider, OpenAIProvider, AnthropicProvider
- 配置: 选择 provider 和 model
- Fallback: 主 provider 失败自动切换备用

#### 2. Self-Healing 定位器 (src/ai/self-healing.ts)
- 当元素定位失败时，用 AI 分析页面截图+DOM 重新定位
- 维护定位器映射: 旧选择器 → 新选择器
- 自动更新 sites/*.json 中的选择器

#### 3. 智能测试生成 (src/ai/test-generator.ts)
- 输入: URL
- AI 自动探索页面，识别可测试的功能点
- 生成完整的 sites/*.json 配置 + 自定义检查脚本
- 输出到 sites/ 目录，可直接运行

#### 4. API
- POST /api/ai/generate-tests — 从 URL 自动生成测试配置
- GET /api/ai/suggest-fixes/{jobId} — AI 分析失败原因并建议修复

### 验收
- 可切换不同 AI provider
- 定位器失败时能自动修复
- 从 URL 能自动生成可运行的测试配置

## 执行顺序
1. Slice 1: Planner/Executor/Evaluator 分层（架构核心）
2. Slice 2: 历史趋势（数据价值）
3. Slice 3: 多租户（平台化）
4. Slice 4: 可插拔 AI（智能增强）
