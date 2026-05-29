# SDD: e2e-verifier 通用化改造 — Test Plan 协议 + Agent 规划执行

## 核心理念

**e2e-verifier 是引擎，项目是测试作者。**

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   项目维护            │     │   e2e-verifier 引擎    │     │   Agent 能力     │
│                      │     │                      │     │                 │
│  test-plan.yaml      │────▶│  1. 解析 test-plan    │────▶│  LLM 规划测试    │
│  (测试规格+验证逻辑)   │     │  2. 启动浏览器        │     │  生成 Playwright  │
│                      │     │  3. 调用 Agent 执行    │     │  自主探索+验证    │
│  scripts/            │     │  4. 收集结果          │     │  反思+重试       │
│  (辅助脚本)           │     │  5. 生成报告          │     │                 │
└─────────────────────┘     └──────────────────────┘     └─────────────────┘
```

## Test Plan 协议

每个项目在 `e2e-test/test-plan.yaml` 中声明测试规格：

```yaml
# LogMonitor 的 test-plan.yaml 示例
project: logmonitor
version: 1.0

# 测试环境配置
environment:
  base_url: http://127.0.0.1/logmon
  api_url: http://127.0.0.1:9200/api
  auth:
    type: form_login
    login_url: /login
    username_field: 'input[type="text"]'
    password_field: 'input[type="password"]'
    submit_button: 'button[type="submit"]'
    credentials:
      username: admin
      password: admin123

# 依赖服务（需要先启动/准备）
dependencies:
  - type: traffic
    description: "Vault Reader 需要产生日志流量"
    target: http://127.0.0.1/vault/
    actions:
      - visit_page
      - click_links: 3
      - search: "test"
      - wait_flush: 5000

# 测试场景（Agent 会根据这些生成具体测试）
scenarios:
  - name: "日志查询与搜索"
    pages: [/logs]
    steps:
      - action: select_app
        target: "webgpu-3d-studio"
        expect: table_visible
        
      - action: search
        input: "error"
        target: 'input[placeholder*="搜索"]'
        expect: results_change
        
      - action: filter_level
        level: "error"
        expect: api_returns_filtered
        
      - action: pagination
        expect: page_changes
        
    validation:
      - type: api_check
        endpoint: /query/logs?appId=webgpu-3d-studio&search=error
        assert: total > 0

  - name: "录制回放"
    pages: [/recordings]
    steps:
      - action: verify_list
        expect: rows > 0
        
      - action: click_play
        target: "first recording with events"
        expect: replay_renders
        
      - action: verify_events
        type: api_check
        endpoint_pattern: /query/recordings/{sessionId}?events=true
        assert: events.length > 0

  - name: "实时会话"
    pages: [/live]
    precondition: "dependencies.traffic 执行后立即检查"
    steps:
      - action: verify_page_structure
        expect: has_online_users_panel AND has_viewer_panel
        
      - action: verify_active_session
        type: api_check
        endpoint: /query/live-sessions
        assert: data != null

  - name: "设置持久化"
    pages: [/settings]
    steps:
      - action: verify_forms_present
        expect: forms > 0
      - action: verify_save_button
        expect: button_visible

  - name: "全页面导航"
    pages: [/, /logs, /performance, /alerts, /live, /recordings, /settings, /users]
    steps:
      - action: navigate_all
        expect: all_200
```

## Agent 执行流程

```
1. 读 test-plan.yaml
2. 解析环境配置（auth, base_url）
3. 检查依赖（如 traffic generation）
4. 对每个 scenario:
   a. Agent 规划：分析 steps → 生成 Playwright 脚本
   b. 执行脚本 → 收集结果
   c. 反思：结果是否符合 expect？
   d. 不符合 → 重新规划重试（最多 2 次）
5. 汇总报告
```

## 项目结构

```
e2e-verifier/                          # 通用引擎
├── src/
│   ├── cli/
│   │   ├── converge.ts               # 现有：收敛引擎
│   │   ├── run-tests.ts              # 新增：通用测试执行器
│   │   └── ...
│   ├── engine/
│   │   ├── test-plan-parser.ts       # 新增：解析 test-plan.yaml
│   │   ├── agent-planner.ts          # 新增：Agent 规划+生成测试
│   │   ├── step-executor.ts          # 新增：执行单个 step
│   │   └── result-collector.ts       # 新增：收集+判定结果
│   ├── explorer/                      # 现有：自动探索
│   └── agent/                         # 现有：LLM agent

log-monitor/                           # 项目自身
├── e2e-test/
│   ├── test-plan.yaml                # 项目维护的测试规格
│   ├── scripts/                      # 辅助脚本（可选）
│   │   └── seed-traffic.ts           # 造流量脚本
│   └── results/                      # 测试结果
```

## 与现有架构的关系

- **converge.ts** → 保留，用于"发现+收敛"模式
- **新增 run-tests.ts** → 通用模式，读 test-plan 执行
- **Agent 能力复用** → agent-loop.ts 的 LLMClient + SelfReflectionGate
- **删除 logmonitor-validator.ts / traffic-generator.ts** → 不应硬编码在引擎中
