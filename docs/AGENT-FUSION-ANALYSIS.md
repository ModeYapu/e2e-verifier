# Agent Toolkit → E2E Verifier 融合分析

## 已有对应关系

| Agent Toolkit | E2E Verifier 现有 | 融合价值 |
|---|---|---|
| Plan-Execute | Intelligence/Planner | ⚠️ 已有，但可借鉴其 PlanStep 状态机 |
| Reflection | Intelligence/Evaluator + SelfReflectionGate | ⚠️ 已有反思机制 |

## 高价值融合（推荐）

### 1. 🔥 Verification Agent → E2E 结果验证引擎
**匹配度: ★★★★★**
- Verification Agent 有多策略验证（Logic Check / Web Search / Cross-Reference / Edge Case）
- E2E 的 Evaluator 目前只有 LLM 和 Rule 两种
- **融合方案**: 用 Verification Agent 的多策略架构升级 Evaluator
  - Claim Decomposition: 把测试断言拆解为原子声明
  - Logic Check: 检查页面逻辑一致性
  - Cross-Reference: 跨检查项交叉验证
  - Edge Case Analysis: 自动发现边界条件
  - Evidence Scoring: 置信度评分 (0-1)
- **影响模块**: `src/intelligence/evaluator.ts`

### 2. 🔥 RAISE Agent → 测试经验库与推理优化
**匹配度: ★★★★★**
- RAISE 的"隐式奖励+经验积累"完美匹配 E2E 测试
- 测试成功/失败就是天然的奖励信号
- **融合方案**:
  - 每次测试后，将成功路径存入经验库（problemSignature = URL+页面特征）
  - 下次遇到类似页面，优先复用成功策略
  - 失败案例的修复历史也存入经验库
  - 自我评估推理质量，逐步优化测试策略
- **影响模块**: 新建 `src/intelligence/experience-store.ts`，增强 `repair-loop.ts`

### 3. 🔥 Context Engineer → 测试上下文优化
**匹配度: ★★★★☆**
- E2E Agent 经常遇到 token 超限（长页面 DOM + 多轮对话）
- Context Engineer 的 5 大能力直接可用：
  - Context Selection: 只选页面相关部分（过滤无关 DOM）
  - Context Compression: 压缩历史对话
  - Context Isolation: 不同测试场景隔离上下文
  - Context Budget: 管理 token 预算
  - Context Write-back: 草稿本持久化关键发现
- **影响模块**: 增强 `src/agent/context-compactor.ts`，新建 `src/intelligence/context-manager.ts`

### 4. 🔥 Multi-Agent → 多角色测试协作
**匹配度: ★★★★☆**
- E2E 测试天然需要多角色：探索者 / 验证者 / 审查者
- **融合方案**:
  - Explorer Agent: 探索页面，发现可测试功能
  - Tester Agent: 执行具体测试步骤
  - Reviewer Agent: 审查结果，判断是否通过
  - Repairer Agent: 修复失败的测试脚本
  - 支持 sequential/parallel/hierarchical 模式
- **影响模块**: 增强 `src/intelligence/orchestrator.ts`

### 5. 🟡 Tree-of-Thought → 复杂测试路径探索
**匹配度: ★★★★☆**
- 当测试复杂交互（多步表单、支付流程）时，可能有多种测试路径
- ToT 可以 BFS/DFS 探索不同测试路径，选择最优
- **融合方案**:
  - Planner 生成多个候选测试计划
  - ToT 评估每个计划的可行性
  - 选择最优路径执行
- **影响模块**: 增强 `src/intelligence/planner.ts`

### 6. 🟡 Self-Evolving → 测试策略自优化
**匹配度: ★★★☆☆**
- 测试框架运行久了，可以学习哪些策略更有效
- 自动优化 prompt、发现新测试模式
- **融合方案**:
  - 追踪测试成功率随时间变化
  - 自动调整 Planner/Evaluator 的 prompt
  - 发现新的有效测试策略并推广

## 中等价值融合

### 7. Tool-Use Agent → 动态工具发现
**匹配度: ★★★☆☆**
- E2E 的检查项可以看作"工具"
- Tool-Use 可以动态组合检查项
- 但目前 checks 已经比较完善，增量价值有限

### 8. Memory Agent → 测试历史记忆
**匹配度: ★★★☆☆**
- 三层记忆（工作/情景/语义）可以增强趋势分析
- 但 E2E 已有 ResultStore + TrendAnalyzer
- 可用于跨站点知识迁移（"A 站点的这个 bug 模式在 B 站点也出现过"）

### 9. ReWOO → 并行测试执行
**匹配度: ★★☆☆☆**
- "先规划不看结果→并行执行" 可以加速测试
- 但 E2E 测试通常需要观察前一步结果再决定下一步
- 仅适合独立的检查项并行

## 不建议融合

| Agent | 原因 |
|---|---|
| Code Agent | E2E 不需要通用代码执行，Playwright 脚本已够用 |
| Research Agent | E2E 不需要深度搜索研究 |
| Debate Agent | 多角色"辩论"测试结果过于复杂 |
| Guardrails Agent | 已有 RuleEvaluator 做基础安全检查 |
| Audit Trail | 已有 ArtifactManager 做证据追踪 |
| Knowledge Graph | 对 E2E 场景过于重量级 |
| Skills Agent | 不需要技能系统 |
| MCP Agent | 已有 API 集成层 |
| Workflow Agent | 已有 Job Queue + Scheduler |
| LATS | MCTS 对测试场景过于复杂 |
| Integrated Agent | 通用编排，已有 Orchestrator |

## 推荐融合优先级

1. **Phase 1** (最高价值): Verification Agent + RAISE → 增强评估和经验积累
2. **Phase 2** (高价值): Context Engineer + Multi-Agent → 上下文优化 + 多角色协作
3. **Phase 3** (中等价值): Tree-of-Thought + Self-Evolving → 复杂路径探索 + 自优化
