# e2e-verifier 项目评估与对比报告

## 一、当前状态总结

### 已完成
| 模块 | 代码量 | 状态 |
|------|--------|------|
| `test-plan-parser.ts` | 268行 | ✅ YAML 解析、类型校验 |
| `agent-planner.ts` | 726行 | ✅ 17种 action、启发式脚本生成 |
| `agent-loop.ts` | 514行 | ✅ LLM Agent 循环（已有但未接入） |
| `llm-client.ts` | 240行 | ✅ LLM API 调用 |
| `self-reflection.ts` | 320行 | ✅ 反思重试逻辑 |
| `run-tests.ts` | 169行 | ✅ CLI 入口 |

### 测试覆盖
| 项目 | 场景数 | 通过率 | 数据验证 |
|------|--------|--------|----------|
| LogMonitor | 11 | 100% | ✅ 下拉验证、表格验证、API字段验证 |
| Vault Reader | 10 | 100% | ⚠️ 基础验证 |
| Depth3D | 7 | 100% | ⚠️ 基础验证 |
| WebGPU | 6 | 16.7% | ❌ headless 限制 |

---

## 二、待完善的 8 个方面

### 1. 🔴 LLM Agent 规划未实际启用
**现状：** `agent-planner.ts` 有 `generateWithLLM()` 和 `generateHeuristicScript()` 两个路径，但实际只用了启发式（硬编码模板）。LLM 路径写了但没接入 API Key 配置。

**需要：**
- 接入 GLM-5 或 DeepSeek 作为 Agent Planner
- 让 LLM 根据 test-plan 生成真正的 Playwright 脚本
- 失败时 LLM 反思原因并调整脚本

### 2. 🔴 缺少视觉回归测试（Visual Regression）
**现状：** 只检查 DOM 结构和文本，不检查视觉效果。

**需要：**
- 每个页面截图 → 与基准图对比
- 使用像素差异检测（pixelmatch / resemble.js）
- 发现 UI 变化自动标记

### 3. 🟡 缺少并发执行能力
**现状：** 4 个项目串行跑，总耗时 ~5 分钟。

**需要：**
- 按项目并行执行（每个项目独立浏览器实例）
- 同项目内场景也可并行（无依赖的场景）
- 预期 4 项目并发 → 总耗时 ~1.5 分钟

### 4. 🟡 缺少 CI/CD 集成
**现状：** 只能 CLI 手动跑。

**需要：**
- GitHub Actions workflow
- PR 触发自动跑测试
- 结果以 comment 或 check 形式反馈

### 5. 🟡 报告和可视化不足
**现状：** 只有 JSON report，没有可视化。

**需要：**
- HTML 报告（含截图、步骤详情、失败分析）
- 趋势追踪（历史通过率变化）
- 与 Portal 页面集成

### 6. 🟡 缺少 Accessibility（无障碍）测试
**现状：** 不检查 ARIA、颜色对比度等。

**需要：**
- axe-core 集成
- 自动检测 ARIA 标签、对比度、可键盘导航

### 7. 🟢 性能指标缺失
**现状：** 不检查页面加载时间。

**需要：**
- Lighthouse 集成或 Web Vitals 采集
- FCP/LCP/CLS 阈值检查

### 8. 🟢 缺少测试数据管理
**现状：** 每次运行都重新造数据（seed traffic）。

**需要：**
- 测试数据快照和恢复
- 数据库 fixture 管理
- 确定性测试环境

---

## 三、主流 E2E 方案对比

### A. 传统脚本框架

| 特性 | Playwright | Cypress | Selenium |
|------|-----------|---------|----------|
| 浏览器支持 | Chromium/Firefox/WebKit | Chrome/Edge/Firefox(实验) | 全部 |
| 语言支持 | JS/TS/Python/Java/C# | JS/TS | 7种语言 |
| 并行执行 | ✅ 原生 | ✅（需付费） | ✅ Grid |
| 自我修复 | ❌ | ❌ | ❌ |
| AI 集成 | ❌ | ❌ | ❌ |
| 学习曲线 | 中等 | 低 | 高 |
| npm 周下载 | 3300万 | 650万 | 1100万 |
| 维护成本 | 高（selector 脆弱） | 高 | 高 |

### B. AI 原生测试平台

| 特性 | Autonoma | Momentic | QA Wolf | Shiplight |
|------|---------|----------|---------|-----------|
| 开源 | ✅ BSL 1.1 | ❌ 闭源 | ❌ 部分开源 | ❌ 插件免费 |
| 自托管 | ✅ | ❌ | ❌ | ✅ |
| 核心架构 | 3 Agent (Planner/Automator/Maintainer) | AI Agent + NL | Agent 写 Playwright | LLM 插件 |
| 自我修复 | ✅ 视觉定位 | ✅ intent-based | ✅ 代码级 | ✅ LLM 驱动 |
| 自然语言测试 | ✅ | ✅ 核心功能 | ✅ | ✅ |
| 生成代码可审查 | ✅ | ❌ | ✅ | ❌ |
| 浏览器支持 | Chromium | Chrome only | Chromium | 任意 |

### C. 我们 e2e-verifier 的定位

| 特性 | e2e-verifier | 对标 |
|------|-------------|------|
| 开源 | ✅ MIT | — |
| 自托管 | ✅ | Autonoma |
| test-plan YAML | ✅ 项目自维护 | Maestro |
| 启发式+LLM 双引擎 | ✅（LLM 未启用） | Autonoma 3-Agent |
| 数据验证层 | ✅ 17 种 action | 独创 |
| 跨项目通用 | ✅ | — |
| 自我修复 | ❌ 待实现 | Autonoma/Momentic |
| 视觉回归 | ❌ 待实现 | Autonoma |
| CI/CD 集成 | ❌ 待实现 | QA Wolf |
| 并行执行 | ❌ 待实现 | Playwright |

---

## 四、值得借鉴的设计

### 1. Autonoma 的三 Agent 架构
```
Planner → 分析代码/页面 → 规划测试策略
Automator → 生成 Playwright 脚本 → 执行
Maintainer → 监测 UI 变化 → 自动修复 selector
```
**我们可以借鉴：** 将现有的 `agent-loop.ts` + `self-reflection.ts` 组合为 Planner，`agent-planner.ts` 作为 Automator，再加一个 Maintainer 模块做 selector 自愈。

### 2. Momentic 的 Intent-Based Testing
用自然语言描述意图（"点击登录按钮"），AI 在运行时定位元素。
**我们可以借鉴：** 当 selector 失败时，用 LLM 分析页面 DOM 自动找到替代 selector。

### 3. Maestro 的 YAML 驱动
和我们最像——用 YAML 定义测试流程。
**我们可以借鉴：** Maestro 支持条件分支和循环，我们的 test-plan 目前是线性步骤。

### 4. QA Wolf 的确定性代码生成
AI 生成的是真实 Playwright 代码，可以审查和版本控制。
**我们已经是这样！** 生成的脚本存为 .ts 文件，可 git 追踪。

---

## 五、优先级排序（建议路线图）

### P0 — 立即（1-2天）
1. **启用 LLM Agent** — 接入 GLM-5，让脚本生成从模板升级为 AI 驱动
2. **并发执行** — 项目级并行，总耗时 -60%

### P1 — 短期（3-5天）
3. **自我修复** — selector 失败时用 LLM 分析 DOM 找替代
4. **HTML 报告** — 含截图、步骤、失败分析
5. **CI/CD 集成** — GitHub Actions workflow

### P2 — 中期（1-2周）
6. **视觉回归** — 截图对比检测 UI 变化
7. **性能指标** — Web Vitals 采集
8. **条件分支** — test-plan 支持 if/else 和循环

### P3 — 长期
9. **Accessibility 测试** — axe-core 集成
10. **测试数据管理** — fixture/snapshot 系统

---

## 六、结论

e2e-verifier 的**数据验证层**（select_and_verify、verify_table_not_empty 等）是目前市面上独一无二的设计——Autonoma 和 Momentic 都没有这种"验证数据正确性"的细粒度 action。

最关键的差距是：
1. **LLM Agent 还没启用**（代码写了但没接入）—— 这是与 Autonoma 的核心差距
2. **没有自我修复** — selector 挂了就是挂了
3. **没有视觉回归** — 只能验证功能不能验证外观

优先把 LLM Agent 接上，e2e-verifier 就能从"模板驱动"升级为"AI 驱动"，成为真正有竞争力的通用 E2E 方案。
