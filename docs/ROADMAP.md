# E2E Verifier 功能路线图

## 1. 产品定位

E2E Verifier 的合理方向不是“再多几个检查项”，而是演进成一个验证执行平台：

- 接收结构化验证任务
- 调度浏览器执行与环境准备
- 统一产出报告、证据、历史趋势
- 支持从人工触发走向 CI、批量、定时、发布门禁

当前项目已经具备 CLI、HTTP API、Playwright 执行、agent/orchestrator 雏形，这说明它不缺功能点，缺的是执行模型、结果模型和平台边界。

## 2. 当前阶段判断

### 已具备

- 基础站点验证
- 多种检查项：console / performance / accessibility / SEO / screenshots
- 批量配置执行
- HTTP API 与异步 job 模型
- Agent / orchestration 探索能力

### 当前短板

- 结果结构还不够稳定，失败归因不够清晰
- 执行器、调度器、agent 逻辑耦合偏高
- 多 viewport / 多环境 / 多浏览器能力还不完整
- API 更像工具入口，不像平台服务
- 缺少长期运行所需的历史趋势、队列、产物管理

## 3. 路线图原则

- 先把执行平台做稳，再做 AI 花活
- 先统一任务模型与结果模型，再扩展检查种类
- 先保证“可重复、可解释、可对比”，再追求“自动探索”
- 所有能力都要服务于一个目标：更可靠地判断某个版本是否真的可发布

## 4. P0（1-3 周）：执行可靠性与结果标准化

目标：让 e2e-verifier 从“能跑测试”进入“能稳定作为验证入口”。

### 4.1 统一任务模型

- 明确 `task -> scenario -> step -> assertion -> artifact`
- 快速验证、深度验证、orchestrated 验证共用一套结果骨架
- 每个失败都必须落到可定位的步骤和证据

### 4.2 统一结果与报告

- 标准化输出：status、summary、checks、artifacts、rootCause
- 失败时自动汇总 console、network、trace、screenshot、DOM 证据
- 支持 HTML 报告 / JSON 报告 / 简版文本报告
- 引入 `flaky / blocked / infra_failed / assertion_failed` 等状态

### 4.3 执行稳定性

- 统一重试策略
- 明确导航、登录、断言、截图的 timeout 规则
- 环境错误与业务失败区分
- artifact 目录结构标准化

### 4.4 验收信号

- 同一任务多次运行结果可重复
- 失败结果能快速区分“环境问题”还是“页面问题”
- CI 能稳定消费 JSON 结果，不需要额外解析 stdout

## 5. P1（1-2 个月）：平台化能力补齐

目标：让 e2e-verifier 具备批量运行、长期运行、接入流水线的基础能力。

### 5.1 调度与队列

- Job queue
- 并发控制
- 优先级与取消
- 定时执行 / webhook 触发 / CI 触发

### 5.2 环境与会话管理

- 登录态复用
- fixture / seed / cleanup 生命周期
- mock server / network stub
- 测试数据隔离

### 5.3 浏览器与设备矩阵

- Chromium / WebKit / Firefox 可选
- Desktop / mobile / tablet 视口矩阵
- UA / locale / timezone / auth profile 切换
- 对比不同环境差异

### 5.4 验收信号

- 一次请求可以稳定驱动多个站点、多场景、多视口执行
- 任务失败时，能知道失败在哪一层：调度、环境、页面、断言
- 能自然接入 CI 作为发布门禁

## 6. P2（2-4 个月）：智能编排与产品化

目标：让 e2e-verifier 从“执行框架”升级到“验证平台”。

### 6.1 Agent / Planner 分层

- Planner：把目标拆成结构化步骤
- Executor：只负责稳定执行
- Evaluator：对结果做判断、归因、建议
- Repair loop：可选地生成修复建议，而不是直接和执行器耦死

### 6.2 历史趋势与质量画像

- 同站点历史通过率
- 回归趋势
- 常见失败模式聚类
- release 前后差异对比

### 6.3 对外平台能力

- REST API + Webhook
- CLI 与 API 共享同一套任务协议
- 多租户任务隔离
- 简版 Dashboard 查看任务与报告

### 6.4 验收信号

- 新场景接入时主要是写任务配置，而不是改执行框架
- AI 能力变成“可插拔增强”，而不是核心执行依赖
- 结果可长期沉淀，能做质量趋势分析

## 7. 建议的系统分层

### 接入层

- CLI
- HTTP API
- CI adapter
- webhook trigger

### 调度层

- job queue
- concurrency control
- cancellation / retry / timeout policy

### 执行层

- browser runner
- login/session manager
- fixture/mock manager
- artifact collector

### 结果层

- report generator
- artifact index
- trend storage
- failure classification

### 智能层

- planner
- evaluator
- guided repair suggestions

## 8. 近期不建议优先做的事

- 继续增加很多零散检查项，但不统一结果模型
- 让 agent 直接主导整个执行生命周期
- 把 API 暴露出去，但没有队列、鉴权、产物治理
- 先做复杂 UI，而没有把报告与任务协议稳定下来

## 9. 推荐实施顺序

1. 统一任务模型与结果模型
2. 统一报告与失败归因
3. 队列与调度
4. 环境/fixture/session 管理
5. 浏览器/设备矩阵
6. Agent / planner / evaluator 分层
7. Dashboard 与历史趋势

## 10. 一句话判断标准

E2E Verifier 的每一步扩展，都应该让它更像一个“可重复、可解释、可编排”的验证平台，而不是一个越来越复杂的脚本集合。
