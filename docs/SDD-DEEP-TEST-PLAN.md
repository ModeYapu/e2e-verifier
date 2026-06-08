# E2E 深度测试计划：验证→优化→验证循环

## 总览
对 4 个项目（Vault Reader、LogMonitor、Depth3D、WebGPU Studio）使用 E2E Verifier 框架进行深度测试，每个项目内部维护 `e2e-test/` 目录保存测试配置和结果。

## 项目分析

| 项目 | 技术栈 | 认证 | 关键功能 | 复杂度 |
|------|--------|------|----------|--------|
| **Vault Reader** | Go + 静态前端 | 无 | 搜索、文章浏览、文件树、概念图谱 | 中 |
| **LogMonitor** | Go + Vue3 + Element Plus | JWT | 登录、日志查询、录制回放、系统设置 | 高 |
| **Depth3D** | 静态 HTML + WebGL | 无 | 图片上传、3D 模型生成、Canvas 交互 | 中 |
| **WebGPU Studio** | TypeScript + WebGPU | 无 | 3D 建模工具、几何体创建、渲染引擎 | 高 |

## 实施方案

### Round 1：基线测试（发现框架问题）
```
1. 为每个项目创建 sites/*.json 配置 + 自定义检查
2. 运行 npm run verify -- 记录基线结果
3. 运行 npm run explore -- 记录探索结果
4. 汇总所有失败的检查项和框架 bug
```

### Round 2：框架优化（修复 Round 1 发现的问题）
```
1. 修复框架 bug（页面跳转、断言逻辑、报告序列化等）
2. 新增：Canvas/WebGL 检查（Depth3D/WebGPU 需要）
3. 新增：搜索功能测试（Vault Reader 需要）
4. 新增：文件上传测试（Depth3D 需要）
```

### Round 3：验证优化效果
```
1. 重新运行所有项目测试
2. 对比 Round 1 vs Round 3 结果
3. 保存最终测试结果到每个项目的 e2e-test/
```

## 目录结构

```
# E2E Verifier 配置
e2e-verifier/sites/
  ├── vault-reader.json        # Vault Reader 测试配置
  ├── logmonitor.json          # LogMonitor 测试配置（已有）
  ├── depth3d.json             # Depth3D 测试配置
  └── webgpu-studio.json       # WebGPU Studio 测试配置

# 各项目测试结果
vault-reader-main/e2e-test/
  ├── baseline-YYYYMMDD.json   # Round 1 基线结果
  ├── final-YYYYMMDD.json      # Round 3 最终结果
  └── screenshots/             # 测试截图

log-monitor/e2e-test/          # 同上（已有 Playwright 测试）
depth3d/e2e-test/
webgpu-3d-studio/e2e-test/
```

## 每个项目的测试重点

### Vault Reader
- 搜索功能：输入关键词 → 有结果返回
- 文章浏览：点击文章 → 内容加载正确
- 文件树：目录展开/折叠
- 概念图谱：页面加载无报错
- 无 undefined/NaN/空内容

### LogMonitor（已有基础）
- 登录流程：表单→提交→跳转
- 日志查询：筛选器交互
- 录制回放：列表加载、播放器渲染
- 系统设置：新 API（/api/system/info）验证
- 404 页面：无效路径显示 NotFound

### Depth3D
- Canvas/WebGL 初始化成功
- 上传按钮存在且可交互
- UI 区域（上传图片、处理流程、多角度重建）渲染正确
- 无 JS 控制台错误

### WebGPU Studio
- 页面加载（注意：WebGPU 可能不可用，需要优雅降级检测）
- Toolbar 渲染
- 属性面板存在
- 无 fatal 错误（WebGPU not supported 算预期）

## 验证→优化→验证循环

```
┌─────────────────────────────────────────────┐
│ Round 1: 运行测试 → 收集问题                │
│   ├─ 4 个项目 × verify + explore            │
│   ├─ 记录通过率、失败原因                    │
│   └─ 汇总框架 bug 清单                      │
├─────────────────────────────────────────────┤
│ Round 2: 优化框架                            │
│   ├─ 修复 bug                               │
│   ├─ 新增检查类型（Canvas/WebGL/搜索/上传）  │
│   └─ npm run build 验证                     │
├─────────────────────────────────────────────┤
│ Round 3: 重新测试 → 对比结果                │
│   ├─ 重跑所有项目                           │
│   ├─ 对比通过率提升                          │
│   └─ 保存结果到各项目 e2e-test/             │
└─────────────────────────────────────────────┘
```
