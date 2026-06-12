# SDD: P6 Final Architecture Polish

## Slice 1: BrowserPool 全覆盖

把所有 chromium.launch() 调用统一到 BrowserPool:
- src/server/verify-server.ts → 用 BrowserPool.getInstance()
- src/verifier.ts → 用 BrowserPool
- src/verifier-pool.ts → 用 BrowserPool（或者废弃，直接用 BrowserPool）
- src/engine/agent-planner.ts → 用 BrowserPool
- src/explorer/autonomous-explorer.ts → 用 BrowserPool
- CLI 工具 (screenshot.ts, converge.ts) 保持独立（CLI 单次运行不需要共享池）

## Slice 2: any 清理第二轮

目标: 213 → <150
重点:
- IntelligenceEvent.data → 联合类型
- Record<string, any> → Record<string, unknown>
- evaluator.ts / planner.ts 的 any 参数
