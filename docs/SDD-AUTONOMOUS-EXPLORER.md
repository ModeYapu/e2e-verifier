# SDD: E2E Verifier 自主探索模式 (Autonomous Explorer)

## 概念
新增"自主探索"验证模式：Agent 自动打开目标网站，通过截图+DOM 分析发现页面结构和功能，自主规划测试用例，编写并执行 Playwright 测试，最终输出完整的测试报告。

与现有 `verify-deep` 的区别：
- `verify-deep`：需要指定 task（"验证登录功能"），Agent 按指令执行
- `explore`（新增）：不指定 task，Agent 自己发现"这个系统有哪些功能"，自动生成并执行测试

## 用户入口
```bash
# 自主探索模式
npm run explore -- --config sites/logmonitor.json

# 或直接指定 URL
npm run explore -- --url http://127.0.0.1/logmon/ --auth '{"loginUrl":"http://127.0.0.1/logmon/login","formSelector":".el-form","username":"admin","password":"admin123","successUrlPattern":"/logmon/(?!login)"}'
```

## 新增文件

### 1. `src/explorer/autonomous-explorer.ts` — 核心探索引擎
主控循环：
1. **Phase 1: Discovery（发现）**
   - 登录（如果需要 auth）
   - 截图首页，分析 DOM 结构
   - 提取导航菜单、侧边栏、路由链接
   - 生成"站点地图"（所有可访问页面的列表）

2. **Phase 2: Planning（规划）**
   - 基于站点地图，为每个页面规划测试用例
   - 识别可交互元素（按钮、表单、表格、筛选器）
   - 生成测试计划 JSON

3. **Phase 3: Testing（测试）**
   - 按测试计划逐页面执行
   - 每个页面：截图 → DOM 分析 → 交互测试 → 断言
   - 记录结果

4. **Phase 4: Reporting（报告）**
   - 汇总所有页面测试结果
   - 生成 JSON + HTML 报告
   - 保存最终 Playwright 测试脚本（可重复执行）

核心类：
```typescript
export class AutonomousExplorer {
  private browser: Browser;
  private page: Page;
  private llm: LLMClient;
  private scriptEngine: ScriptEngine;
  private screenshots: string[];
  
  // LLM 交互：分析截图和 DOM，生成测试计划
  async analyzePage(page: Page): Promise<PageAnalysis>
  async generateTestPlan(analyses: PageAnalysis[]): Promise<TestPlan>
  async generateTestCase(pageAnalysis: PageAnalysis): Promise<TestCase>
  
  // 主循环
  async explore(config: ExploreConfig): Promise<ExploreResult>
}
```

### 2. `src/explorer/types.ts` — 探索相关类型
```typescript
export interface ExploreConfig {
  url: string;
  auth?: AuthConfig;
  maxPages?: number;        // 最多探索多少页面（默认 20）
  maxDepth?: number;        // 导航深度（默认 2）
  screenshotDir?: string;
  llm: AgentConfig;
}

export interface PageAnalysis {
  url: string;
  title: string;
  screenshot: string;
  domSummary: string;       // DOM 结构摘要
  navigation: NavItem[];    // 导航链接
  interactiveElements: InteractiveElement[];  // 可交互元素
  forms: FormAnalysis[];    // 表单
  tables: TableAnalysis[];  // 表格数据
  suggestedTests: string[]; // LLM 建议的测试点
}

export interface NavItem {
  text: string;
  href: string;
  selector: string;
}

export interface InteractiveElement {
  type: 'button' | 'input' | 'select' | 'link' | 'toggle';
  selector: string;
  text: string;
  action: string;  // 描述这个元素做什么
}

export interface FormAnalysis {
  selector: string;
  fields: Array<{ type: string; selector: string; label?: string }>;
  submitButton?: string;
}

export interface TableAnalysis {
  selector: string;
  headers: string[];
  rowCount: number;
  sampleData: string[][];  // 前 3 行数据
}

export interface TestPlan {
  pages: PageTestPlan[];
  totalTests: number;
}

export interface PageTestPlan {
  url: string;
  pageName: string;
  tests: TestCase[];
}

export interface TestCase {
  name: string;
  description: string;
  steps: string[];          // 自然语言描述的步骤
  assertions: string[];     // 预期结果
  priority: 'high' | 'medium' | 'low';
}

export interface TestExecution {
  testCase: TestCase;
  passed: boolean;
  screenshot: string;
  script: string;           // 生成的 Playwright 脚本
  output: string;           // 执行输出
  error?: string;
}

export interface ExploreResult {
  config: ExploreConfig;
  discovery: PageAnalysis[];
  testPlan: TestPlan;
  executions: TestExecution[];
  summary: {
    pagesExplored: number;
    testsPlanned: number;
    testsPassed: number;
    testsFailed: number;
    duration: number;
    totalTokens: number;
  };
  finalScript: string;      // 完整可重放的测试脚本
}
```

### 3. `src/explorer/page-analyzer.ts` — 页面分析器
不依赖 LLM 的 DOM 分析（减少 token 消耗）：
```typescript
export class PageAnalyzer {
  // 纯 DOM 分析，不消耗 token
  async analyze(page: Page): Promise<PageAnalysis>
  async extractNavigation(page: Page): Promise<NavItem[]>
  async extractInteractiveElements(page: Page): Promise<InteractiveElement[]>
  async extractForms(page: Page): Promise<FormAnalysis[]>
  async extractTables(page: Page): Promise<TableAnalysis[]>
  async extractDomSummary(page: Page): Promise<string>
}
```

### 4. `src/explorer/test-generator.ts` — 测试用例生成器
```typescript
export class TestGenerator {
  private llm: LLMClient;
  
  // 基于页面分析生成测试计划
  async generatePlan(analyses: PageAnalysis[]): Promise<TestPlan>
  
  // 基于单个页面分析生成具体测试用例
  async generateTests(analysis: PageAnalysis): Promise<TestCase[]>
  
  // 基于 TestCase 生成 Playwright 脚本
  async generateScript(test: TestCase, pageAnalysis: PageAnalysis, auth?: AuthConfig): Promise<string>
  
  // 合并所有测试脚本为一个可重放文件
  mergeScripts(scripts: string[], auth?: AuthConfig): string
}
```

### 5. `src/cli/explore.ts` — CLI 入口
```bash
npm run explore -- [options]
Options:
  --url, -u         目标 URL
  --config, -c      站点配置文件（复用 SiteConfig）
  --auth            JSON 格式的 auth 配置
  --max-pages       最大探索页面数（默认 20）
  --max-depth       最大导航深度（默认 2）
  --model, -m       LLM 模型（默认 glm-4）
  --api-key, -k     API key
  --api-base, -b    API base URL
  --output, -o      输出目录（默认 explorer-output/）
  --json, -j        JSON 输出
  --no-llm          纯 DOM 分析模式（不调用 LLM，只做基础探索）
```

### 6. `src/explorer/explorer-report.ts` — 探索报告生成器
生成探索报告（JSON + HTML），包含：
- 站点地图（页面列表+截图缩略图）
- 测试计划（每个页面的测试用例）
- 执行结果（通过/失败/截图）
- 最终 Playwright 脚本（可下载重用）

## package.json 新增脚本
```json
{
  "explore": "ts-node src/cli/explore.ts"
}
```

## 工作流程

```
用户执行 npm run explore -- --config sites/logmonitor.json
         │
         ▼
    1. 加载配置，启动浏览器
         │
         ▼
    2. 登录（如果需要 auth）
         │
         ▼
    3. Phase 1: Discovery
       ├─ 截图首页
       ├─ PageAnalyzer.analyze() — 提取 DOM 结构
       ├─ 提取导航菜单 → 获取所有页面链接
       └─ 逐页面访问 → 截图 + DOM 分析
         │
         ▼
    4. Phase 2: Planning（调用 LLM）
       ├─ 将所有 PageAnalysis 发送给 LLM
       ├─ LLM 返回 TestPlan（每个页面 N 个测试用例）
       └─ 输出测试计划 JSON
         │
         ▼
    5. Phase 3: Testing（调用 LLM + ScriptEngine）
       ├─ 遍历 TestPlan
       ├─ 对每个 TestCase:
       │   ├─ LLM 生成 Playwright 脚本
       │   ├─ ScriptEngine 执行脚本
       │   ├─ 截图验证
       │   └─ 记录结果
       └─ 汇总所有执行结果
         │
         ▼
    6. Phase 4: Reporting
       ├─ 合并所有测试为一个 final_script.ts
       ├─ 生成 JSON + HTML 报告
       └─ 保存到 explorer-output/
         │
         ▼
    7. 输出摘要，退出
```

## 与现有代码的集成
- **复用** `LLMClient`（agent/llm-client.ts）— 调用 LLM
- **复用** `ScriptEngine`（agent/script-engine.ts）— 执行脚本
- **复用** `AuthConfig`（types/index.ts）— 登录逻辑从 verifier.ts 提取
- **复用** `ScreenshotUtil`（utils/screenshot.ts）— 截图
- **复用** `HtmlReportGenerator`（utils/html-report.ts）— HTML 报告
- **新增** `src/explorer/` 目录 — 探索相关所有文件

## 关键设计决策
1. **PageAnalyzer 不依赖 LLM** — DOM 分析用 Playwright API 直接做，节省 token
2. **LLM 只在规划和脚本生成阶段调用** — 减少 API 成本
3. **探索结果持久化** — 测试脚本可独立重用，不依赖 Explorer
4. **支持 --no-llm 模式** — 纯 DOM 探索，不做智能测试生成
5. **截图作为上下文** — LLM 分析截图来理解页面功能

## 验证标准
```bash
cd /root/.openclaw/workspace/e2e-verifier
npm run build  # 零错误
npm run explore -- --config sites/logmonitor.json --no-llm  # 基础探索通过
```
