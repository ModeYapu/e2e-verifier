# SDD: Agent Fusion — Agent Toolkit 模式融入 E2E Verifier

## 目标
将 Agent Toolkit 中 4 个高匹配 Agent 模式融入 E2E Verifier，增强智能测试能力。

## Slice 1: Verification Agent 融合 — 多策略验证引擎

### 需要实现

#### 1. MultiStrategyEvaluator (src/intelligence/multi-strategy-evaluator.ts)
借鉴 @agent-toolkit/verification-agent 的多策略验证架构：

```typescript
interface VerificationStrategy {
  name: string;
  verify(result: ScenarioResult, context: VerificationContext): Promise<StrategyVerdict>;
}

interface StrategyVerdict {
  passed: boolean;
  confidence: number;  // 0-1
  evidence: string[];
  issues: string[];
}

interface VerificationContext {
  target: TestTarget;
  plan: TestPlan;
  previousResults?: ScenarioResult[];  // 历史结果用于对比
}
```

**5 种验证策略**：
1. **LogicCheckStrategy**: 逻辑一致性检查
   - 断言是否矛盾（如：期望 200 但页面是 404）
   - 检查步骤顺序是否合理
   - 数据一致性（如：购物车总价 = 各项之和）

2. **VisualConsistencyStrategy**: 视觉一致性检查
   - 截图对比（与基线/历史对比）
   - 页面是否出现明显异常（空白/错位/乱码）
   - 响应式布局是否正常

3. **CrossReferenceStrategy**: 跨检查项交叉验证
   - 性能指标与功能结果交叉验证
   - Console errors 与失败步骤关联
   - Network 请求与断言匹配

4. **EdgeCaseStrategy**: 边界条件分析
   - 空输入、超长输入、特殊字符
   - 并发操作、快速连续点击
   - 极端视口尺寸

5. **EvidenceScoringStrategy**: 基于证据的置信度评分
   - 综合所有策略结果
   - 加权计算最终置信度
   - 生成结构化验证报告

#### 2. Claim Decomposition (src/intelligence/claim-decomposer.ts)
- 将测试断言分解为原子性声明
- 例: "购物车功能正常" → [显示正确、可以添加商品、数量可修改、总价计算正确、可以结算]
- 每个声明独立验证，避免一个失败导致全部判定失败

#### 3. 集成到现有 Evaluator
- 在 `src/intelligence/evaluator.ts` 中新增 `MultiStrategyEvaluator` 作为第三种评估模式
- 配置选项: `{ evaluator: 'rule' | 'llm' | 'multi-strategy' }`
- Orchestrator 可选择使用哪种评估器

### 验收
- 5 种验证策略全部实现
- 可通过 API 选择使用 multi-strategy 评估
- 与现有 rule/llm 评估器共存

## Slice 2: RAISE Agent 融合 — 测试经验库

### 需要实现

#### 1. Experience Store (src/intelligence/experience-store.ts)
借鉴 @agent-toolkit/raise 的经验积累机制：

```typescript
interface TestExperience {
  id: string;
  problemSignature: string;   // URL+页面特征哈希
  context: string;            // 页面描述
  strategy: string;           // 使用的测试策略
  outcome: 'success' | 'failure' | 'partial';
  reward: number;             // 隐式奖励 (-1 to 1)
  testPlan: TestPlan;         // 成功的测试计划
  repairHistory?: RepairAttempt[];  // 修复历史
  timestamp: number;
  meta: { browser, viewport, siteName };
}

interface RewardSignal {
  experience: TestExperience;
  reward: number;
  reason: string;
}
```

- 持久化到 `data/experiences.json`
- `record(experience)` — 记录经验
- `querySimilar(signature, topK)` — 查找相似经验（余弦相似度）
- `getSuccessfulPlans(signature)` — 获取成功的测试计划
- `calculateReward(result)` — 计算隐式奖励
  - 完全通过: +1.0
  - 部分通过: +0.5
  - 失败但修复成功: +0.3
  - 失败且无法修复: -0.5
  - flaky: -0.2

#### 2. Experience-Guided Planner (src/intelligence/experience-planner.ts)
- Planner 生成测试计划前，先查经验库
- 如果有相似页面的成功计划 → 优先复用（调整选择器）
- 如果没有 → 用 LLM 生成新计划
- 新计划执行后 → 记录到经验库

#### 3. Self-Evaluation Engine (src/intelligence/self-eval.ts)
- 每次测试后评估推理质量
- "这次测试策略是否有效？"
- "有哪些步骤可以优化？"
- 将评估结果反馈到经验库
- 统计每种策略的成功率，自动偏好高效策略

#### 4. 集成
- IntelligenceOrchestrator 中注入 ExperienceStore
- 执行前：查询经验 → 优化计划
- 执行后：记录经验 → 计算奖励
- API: GET /api/experiences?site=X, GET /api/experiences/stats

### 验收
- 经验自动记录和查询
- 相似页面能复用成功策略
- 奖励信号计算正确

## Slice 3: Context Engineer 融合 — 上下文优化

### 需要实现

#### 1. Context Manager (src/intelligence/context-manager.ts)
借鉴 @agent-toolkit/context-engineer：

**5 大能力**：
1. `selectContext(rawContext, task, budget)` — 智能选择相关信息
   - 从完整 DOM 中只提取与当前测试相关的部分
   - 过滤无关节点（广告、脚注、隐藏元素）
   - 优先保留交互元素和关键文本

2. `compressContext(messages, ratio)` — 上下文压缩
   - 将历史对话压缩为精炼摘要
   - 保留关键决策和发现
   - 目标：压缩到原始的 30-50%

3. `isolateContext(taskId)` — 上下文隔离
   - 每个测试场景独立上下文窗口
   - 避免场景间信息干扰
   - 共享的通用信息（如站点配置）单独管理

4. `allocateBudget(totalTokens, tasks)` — Token 预算管理
   - 为每个任务分配 token 预算
   - 动态调整：复杂任务分配更多
   - 预警：接近上限时自动压缩

5. `writeBack(key, value)` — 草稿本持久化
   - 关键发现持久化到文件
   - 跨场景可复用
   - 例：页面结构分析结果、登录 token 等

#### 2. DOM Filter (src/intelligence/dom-filter.ts)
- 分析 Playwright 获取的完整 DOM
- 过滤无关内容
- 保留测试相关节点（表单、按钮、链接、输入框）
- 输出精简 DOM 给 LLM

#### 3. 集成
- 替换现有的 context-compactor.ts
- 在 AgentLoop 和 Planner 中使用 ContextManager
- 配置: `contextManager.budget = 4000` tokens

### 验收
- DOM 过滤减少 60%+ 无关节点
- 上下文压缩保持关键信息
- Token 预算管理生效

## Slice 4: Multi-Agent 融合 — 多角色测试协作

### 需要实现

#### 1. Test Roles (src/intelligence/test-roles.ts)
借鉴 @agent-toolkit/multi-agent：

```typescript
type TestRole = 'explorer' | 'tester' | 'reviewer' | 'repairer';

interface TestAgent {
  role: TestRole;
  systemPrompt: string;
  tools?: string[];
}
```

- **Explorer**: 探索页面结构，发现可测试功能，生成测试候选列表
- **Tester**: 执行具体测试步骤（使用 Playwright）
- **Reviewer**: 审查测试结果，判断通过/失败/需重测
- **Repairer**: 修复失败的测试脚本

#### 2. Multi-Agent Orchestrator (src/intelligence/multi-test-orchestrator.ts)
- 4 种编排模式：
  - `sequential`: Explorer → Tester → Reviewer（串行）
  - `parallel`: 多个 Tester 并行测试不同场景
  - `hierarchical`: Explorer 规划 → 分配给多个 Tester → Reviewer 汇总
  - `debate`: Reviewer 意见不一致时，多 Reviewer 辩论

#### 3. Agent Communication (src/intelligence/agent-message.ts)
- Agent 间消息传递
- 共享工作空间（测试发现、中间结果）
- 消息类型：发现新功能 / 测试完成 / 发现问题 / 修复建议

#### 4. 集成
- POST /api/verify/multi-agent — 多角色验证
- 配置: `{ mode: 'hierarchical', roles: ['explorer','tester','reviewer'] }`

### 验收
- 4 种编排模式可用
- Agent 间消息传递正常
- 比单一 Agent 模式测试更全面

## 执行顺序
1. Slice 1: Verification Agent 融合（增强评估质量）
2. Slice 2: RAISE 融合（经验积累与复用）
3. Slice 3: Context Engineer 融合（上下文优化）
4. Slice 4: Multi-Agent 融合（多角色协作）
