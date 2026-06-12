# E2E Verifier — Architecture Code Review Round 3 (Post-P5)

**审查日期**: 2026-06-10
**代码规模**: 33,686 行 TypeScript, ~90 个源文件
**对比基准**: P4 后 R2 Review

---

## ✅ P5 修复确认

| R2 问题 | 修复状态 | 说明 |
|---|---|---|
| 🟠 双 Job 数据源 | ✅ 已修复 | Legacy 端点委托给 jobService，删除 verifyService 内存 Map |
| 🟠 any 类型 (270→213) | ⚠️ 部分修复 | 110→78 (intelligence)，总体还剩 213 处 |
| 🟠 双执行路径/Browser | ⚠️ 部分修复 | BrowserPool 创建了但 verify-server.ts 仍在直接 chromium.launch() |
| 🟠 JSON 并发保护 | ✅ 已修复 | JsonStorage 原子写，ExperienceStore/ProjectStore/JobStore 已集成 |

## 🟡 Remaining Issues

### 1. BrowserPool 未完全统一
**现状**: BrowserPool 已创建并被 verify-service、scheduler、executor 使用。
但以下文件仍在直接 `chromium.launch()`:
- `src/server/verify-server.ts:235` — 仍然 `this.browser = await chromium.launch()`
- `src/verifier.ts:38` — 直接 launch
- `src/verifier-pool.ts:14` — 直接 launch
- `src/explorer/autonomous-explorer.ts` — 3 处直接 launch
- `src/explorer/test-generator.ts` — 4 处直接 launch
- `src/engine/agent-planner.ts` — 直接 launch
- `src/cli/screenshot.ts`, `src/cli/converge.ts` — CLI 直接 launch

BrowserPool 只覆盖了 3 个模块，还有 ~10 处游离。

**影响**: 内存浪费（同时可能有 5+ 个 Chromium 实例）

### 2. any 仍有 213 处
Intelligence 78 + routes 25 + engine 28 + 其余 ~82。
从 270 降到 213 是进步，但量级没变。

最典型问题:
- `IntelligenceEvent.data` 仍然是 any（虽然 SDD 要求改为 union type）
- 大量 `Record<string, any>` 在 experience/planner/evaluator 中

### 3. verify-service.ts 从 577→399 行
拆 Job 逻辑后瘦了，但仍偏大（含 fast/deep/orchestrated verify + matrix + intelligent + multi-agent 逻辑）

### 4. verify-server.ts 仍持有一个 browser 实例
`src/server/verify-server.ts:235` 有 `this.browser = await chromium.launch()`，和 BrowserPool 重复。

## 📊 架构评分对比

| 维度 | R2 | R3 | 变化 |
|------|-----|-----|------|
| **模块化** | 7 | 7.5 | +0.5 (Job 数据源统一) |
| **类型安全** | 6 | 6.5 | +0.5 (any 减少 21%) |
| **可测试性** | 4 | 4.5 | +0.5 (JsonStorage 可 mock) |
| **可扩展性** | 7 | 7.5 | +0.5 (BrowserPool 基础设施) |
| **数据层** | 3 | 7 | +4 (JsonStorage 原子写) |
| **代码组织** | 8 | 8 | 0 |
| **依赖管理** | 8 | 8 | 0 |
| **综合** | **6.1** | **7.0** | **+0.9** |

## 🟢 结论: 架构健康

综合评分 **7.0/10** — 已达到「健康」水平。

R2 提出的 4 个 High 问题中：
- 2 个完全修复（Job 数据源、JSON 并发）
- 2 个部分修复（any 类型、Browser 统一）

**剩余问题不再影响核心架构健康**，属于渐进优化范畴：
- BrowserPool 覆盖率可逐步提升
- any 类型可随日常开发逐步替换
- verify-service 可按需继续拆分

**建议**: 可以停止专门的架构修复循环，转入功能开发或部署。
