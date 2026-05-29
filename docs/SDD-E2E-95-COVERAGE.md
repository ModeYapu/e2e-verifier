# SDD: E2E Verifier 95% Coverage Enhancement

## 目标
将 e2e-verifier 的自动化测试覆盖率从当前的 ~60% 提升到 95%，
重点覆盖 LogMonitor 的实时会话、录制回放、搜索筛选等交互密集型功能。

## 当前覆盖分析

### 已覆盖（当前 Explore 测试）
- ✅ 页面加载 (loads correctly)
- ✅ 无 undefined/NaN 文本
- ✅ 交互元素存在性
- ✅ 按钮可点击
- ✅ 导航链接
- ✅ 表格数据行
- ✅ 表单可提交

### 未覆盖（缺口）
| 功能 | 缺口原因 | 优先级 |
|------|---------|--------|
| 搜索查询 | 无搜索交互测试 | P0 |
| 筛选器（下拉选择） | Element Plus 下拉组件在 headless 中不可见 | P0 |
| 实时会话（Live） | 需要先造流量（用户浏览→SDK上报→WS推送） | P1 |
| 录制回放（Replay） | 需要先造录制数据，再验证回放 | P1 |
| 日志搜索结果验证 | 需要输入关键词→等结果→验证 | P0 |
| 分页 | 分页组件交互 | P2 |
| 设置表单提交 | 设置保存→验证持久化 | P2 |
| 用户 CRUD | 创建/编辑/删除用户 | P2 |
| 跨页面联动 | 在 A 页操作→B 页验证数据变化 | P1 |

## 方案

### Phase 1: TrafficGenerator（造流量）
在 Explore 阶段之前，用 Playwright 模拟真实用户访问 Vault Reader，
触发 SDK 上报事件和 rrweb 录制，让 LogMonitor 有数据。

```
TrafficGenerator {
  1. 启动 Playwright 浏览器
  2. 访问 Vault Reader（自动触发 SDK init + cobrowse）
  3. 执行 3-5 个交互操作（点击链接、搜索、滚动）
  4. 等待 SDK flush（5秒 buffer interval）
  5. 等待 LogMonitor 处理（2秒）
  6. 关闭浏览器（触发 beforeunload → recording end）
}
```

### Phase 2: Enhanced PageAnalyzer（增强页面分析）
新增 SPA 交互检测能力：

- **搜索输入检测**: `input[placeholder*="搜索"], input[type="search"]`
- **下拉筛选检测**: `.el-select, select`
- **分页检测**: `.el-pagination`
- **Tab 切换检测**: 已有（`[role=tab]`）
- **对话框检测**: `.el-dialog, .el-drawer, [role=dialog]`

### Phase 3: InteractionTestGenerator（交互测试生成）
为检测到的交互元素生成专门的测试：

```typescript
// 搜索测试模板
搜索框输入 → 等待结果 → 验证结果变化

// 筛选测试模板
打开下拉 → 选择选项 → 验证表格数据变化

// 实时会话测试模板
验证 live-sessions API → 有数据则验证页面渲染

// 录制回放测试模板
验证 recordings API → 点击播放 → 验证回放渲染
```

### Phase 4: LogMonitorValidator（LogMonitor 专项验证）
直接通过 API 验证 LogMonitor 的数据完整性：

```typescript
// 造流量后验证
1. /api/query/stats → 验证事件数 > 0
2. /api/query/logs → 验证搜索可用
3. /api/query/recordings → 验证有新录制
4. /api/query/recordings/{id}?events=true → 验证事件不为空
5. /api/query/live-sessions → 验证会话存在（造流量期间）
```

## 覆盖率计算

| 项目 | 当前 | 增强后 | 说明 |
|------|------|--------|------|
| Vault Reader | 45% | 90% | +搜索、导航、SDK上报验证 |
| LogMonitor | 55% | 95% | +搜索筛选、Live、录制、API验证 |
| Depth3D | 73% | 85% | +Tab交互、3D渲染检查 |
| WebGPU Studio | 20% | 70% | headless限制，尽可能覆盖 |
| **平均** | **48%** | **85%+** | |

LogMonitor 95% 覆盖的具体测试点：
1. 登录/登出 ✅ (已有)
2. 概览仪表盘数据 ✅ (已有)
3. 日志列表+搜索 ✅ (已有 + 新增搜索验证)
4. 日志级别筛选 → 新增
5. 时间范围筛选 → 新增
6. App 选择器切换 → 新增
7. 性能分析页面 → 新增
8. 告警规则列表 → 新增
9. 实时会话（有流量时）→ 新增
10. 录制列表+搜索 → 新增
11. 录制回放播放 → 新增
12. 设置保存 → 新增
13. 用户列表 → 新增

## 实现文件
- `src/explorer/traffic-generator.ts` — 流量生成器
- `src/explorer/interaction-test-generator.ts` — 交互测试生成
- `src/explorer/logmonitor-validator.ts` — LogMonitor API 验证
- 修改 `src/explorer/page-analyzer.ts` — 增强交互检测
- 修改 `src/cli/converge.ts` — 集成新测试流程
