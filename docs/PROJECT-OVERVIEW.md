# E2E Verifier — AI 驱动的全流程测试平台

## 项目概述

E2E Verifier 是一个**自研的 AI 驱动端到端测试平台**，结合了 Agentic 智能代理 + 视觉校验 + 自纠错闭环三大技术路线，实现了从任务接收到报告产出的全自动化测试生命周期。

**GitHub**: `ModeYapu/e2e-verifier`（私有仓库）
**部署地址**: `http://sanfacheng.cyou/agent-toolkit/`（通过 Agent Toolkit 平台统一入口）
**API 服务**: 端口 `8091`（systemd 守护运行，已稳定运行 7+ 天）

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    接入层 (Access Layer)                   │
│  CLI (verify/craft/explore)  │  HTTP API (Express :8091) │
│  配置驱动 (sites/*.json)     │  异步 Job Queue           │
└──────────────┬──────────────────────────┬────────────────┘
               │                          │
┌──────────────▼──────────┐  ┌────────────▼───────────────┐
│    调度层 (Scheduler)     │  │    智能层 (AI Layer)        │
│  VerifyOrchestrator      │  │  AgentLoop (LLM Agent)      │
│  AgentPlanner            │  │  SelfReflectionGate         │
│  并发/重试/超时           │  │  ContextCompactor           │
│  Job 状态追踪            │  │  LLMClient (多模型支持)      │
└──────────────┬──────────┘  └────────────┬────────────────┘
               │                          │
┌──────────────▼──────────────────────────▼────────────────┐
│                    执行层 (Execution Layer)                │
│  Playwright (Chromium)    │  ScriptEngine (沙箱执行)       │
│  AutonomousExplorer       │  PageAnalyzer (DOM 分析)       │
│  Screenshot 对比          │  TestGenerator (用例生成)       │
└──────────────┬───────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────┐
│                    结果层 (Result Layer)                   │
│  JSON/HTML 报告  │  截图证据  │  性能指标  │  失败归因      │
│  ArtifactManager │  重试历史  │  趋势对比  │  分级状态      │
└──────────────────────────────────────────────────────────┘
```

## 核心能力与行业路线映射

### ✅ 路线 1: Agentic 智能代理与自适应执行

**已实现**:
- **AgentLoop**: LLM Agent 自主规划测试路径 → 生成 Playwright 脚本 → 执行 → 反思 → 迭代
- **SelfReflectionGate**: 防止 Agent "假完成"——通过沙箱验证脚本执行结果，强制 Agent 证明任务真的完成
- **ContextCompactor**: 上下文压缩，长对话时自动精简历史，避免 token 超限
- **ScriptEngine**: 沙箱执行 Playwright 脚本，隔离运行环境
- **自愈能力**: Agent 在执行失败时自动分析错误原因并重新生成修正后的脚本（反思-修复循环）

**技术细节**:
- LLM 支持: GLM-4.5-Flash / GLM-5-Turbo（通过 OpenAI 兼容 API 接入）
- Prompt 工程: 结构化 `<thought>/<action>` 输出格式，支持 write_script / execute_script / inspect_screenshot / reflect / done 五种动作
- 最大反思轮次可配置，防止无限循环

### ✅ 路线 2: 基于自然语言与低代码

**已实现**:
- **TestPlan Parser**: 解析 YAML/JSON 格式的自然语言测试计划，自动拆解为 scenario → step → assertion
- **配置驱动**: `sites/*.json` 声明式定义站点测试（URL、检查项、视口、自定义检查）
- **CLI 命令**: `verify`（快速验证）/ `verify:deep`（深度验证）/ `verify:orchestrated`（编排验证）/ `verify:craft`（Agent 驱动验证）
- 非技术人员可通过 JSON 配置描述测试意图，无需写代码

### ✅ 路线 3: 视觉全链路回归

**已实现**:
- **多视口截图**: Desktop (1920×1080) / Tablet / Mobile 自动切换
- **截图对比**: 基线截图 vs 当前截图，自动保存带时间戳的证据
- **DOM 分析**: PageAnalyzer 提取页面结构、交互元素、可访问性状态
- **Console 错误捕获**: 自动收集 JS 错误、网络错误
- **性能指标采集**: FCP / DCL / Load Time / Page Weight

### ✅ 路线 4: 白盒自纠错闭环

**已实现**:
- **AgentPlanner**: 读取测试计划 → LLM 规划 → 生成 Playwright 代码 → 真实执行 → 失败自动重新规划
- **Orchestrated Verification**: 多场景编排执行，统一收集证据
- **Converge 收敛**: 多轮执行直到结果稳定（连续 N 次结果一致才通过）
- **ArtifactManager**: 自动管理截图、trace、console log 等产物
- **失败分级**: flaky / blocked / infra_failed / assertion_failed 状态区分

## 检查项清单

| 类别 | 检查项 | 状态 |
|------|--------|------|
| HTTP | 状态码验证 | ✅ |
| Performance | FCP / DCL / Load / Page Weight | ✅ |
| Accessibility | 标题层级 / 表单标签 / ARIA / alt 文本 | ✅ |
| SEO | title / meta description / H1 / favicon / OG tags | ✅ |
| Console | JS 错误捕获 | ✅ |
| Screenshot | 多视口截图 + 基线对比 | ✅ |
| Custom | 自定义 JS 断言脚本 | ✅ |
| Agent | LLM 自主探索 + 脚本生成 | ✅ |
| Deep | 多步骤编排验证 | ✅ |

## 当前已配置的测试站点 (10 个)

| 站点 | 地址 | 检查类型 |
|------|------|----------|
| Depth3D | localhost/depth3d | screenshot, console, performance, WebGL |
| Example | example.com | 基础验证 |
| GitHub | github.com | screenshot, performance |
| History Tree | localhost:8000 | 完整检查 |
| LogMonitor | sanfacheng.cyou/logmon | 完整检查 |
| Portal | sanfacheng.cyou | 系统信息页 |
| Quiz (AI 学习) | sanfacheng.cyou/quiz | AI 学习系统 |
| Vault Reader | localhost:3000/vault | 知识库 |
| WebGPU Studio | localhost | WebGPU 检查 |
| OpenClaw | localhost:18789 | 管理面板 |

## 代码规模

- **总代码**: 12,633 行 TypeScript
- **核心模块**:
  - `src/agent/` (5 文件): LLM Agent 循环、脚本引擎、自我反思
  - `src/explorer/` (4 文件): 自主探索器、页面分析、测试生成
  - `src/engine/` (2 文件): Agent 规划器、测试计划解析
  - `src/orchestrator/` (1 文件): 多场景编排
  - `src/server/` (1 文件): HTTP API 服务
  - `src/checks/`: 各类检查项实现
  - `src/cli/` (7 文件): 命令行工具集
- **依赖**: Playwright + Express + TypeScript（轻量依赖）

## 当前进度 (ROADMAP)

### ✅ P0 已完成: 执行可靠性与结果标准化
- 统一任务模型 (task → scenario → step → assertion → artifact)
- 标准化结果输出 (status / summary / checks / artifacts / rootCause)
- 失败分级 (flaky / blocked / infra_failed / assertion_failed)
- ArtifactManager + 重试策略 + 超时规则
- Agent 能力: 自主探索 + 脚本生成 + 自我反思

### 🔜 P1 待开发: 平台化能力补齐
- Job Queue 调度
- 登录态复用 + Fixture 管理
- 多浏览器矩阵 (Chromium / WebKit / Firefox)
- CI/CD 集成 (Webhook 触发)

### 🔜 P2 待开发: 智能编排与产品化
- Planner / Executor / Evaluator 分层
- 历史趋势 + 质量画像
- Dashboard 可视化
- 多租户任务隔离

## 与行业方案的差异化优势

| 维度 | 行业方案 (QA Wolf/testRigor/Applitools) | E2E Verifier |
|------|----------------------------------------|--------------|
| 部署方式 | SaaS（付费） | 自托管，完全自主 |
| AI 能力 | 单一 LLM 辅助 | 多层 AI: Agent + Planner + Reflector + Explorer |
| 自愈机制 | 定位器自愈 | 全链路自愈：脚本级 → 规划级 → 反思级 |
| 闭环深度 | 检测+报告 | 检测 → 归因 → 修复建议 → 重验证（收敛） |
| 扩展性 | 平台锁定 | 开源架构，可对接任意 LLM / 浏览器 / CI |
| 成本 | 月费 $数百-$数万 | 仅 LLM API 调用费（GLM-5-Turbo 极低成本） |

## 一句话定位

E2E Verifier 是一个**自研的、AI 全链路驱动的端到端测试平台**，融合了 Agentic 智能代理、视觉校验、自然语言测试计划和自纠错闭环四大能力，目标是从"跑测试脚本"进化为"可重复、可解释、可自愈的验证平台"。
