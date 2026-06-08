# SDD: E2E Verifier Framework Optimization

## 目标
优化 `/root/.openclaw/workspace/e2e-verifier/` 框架，解决当前问题并增强功能。

## 项目位置
- 源码：`/root/.openclaw/workspace/e2e-verifier/`
- 类型：TypeScript + Playwright
- 构建：`npm run build` (tsc)
- 运行：`npm run verify -- --config sites/logmonitor.json`

## 优化项（按优先级）

### 1. 🔴 共享浏览器实例
**文件**: `src/verifier.ts`
**问题**: 每次验证 `new Verifier()` 都 `chromium.launch()` + `browser.close()`，批量 5 个页面就开关 5 次
**方案**: 
- Verifier 接受可选的 `Browser` 实例参数
- 新增 `VerifierPool` 类管理共享浏览器
- CLI 入口（verify.ts, verify-all.ts）在开头启动浏览器，结尾关闭
- 保留独立模式兼容性（不传 Browser 则自己启动关闭）

```typescript
// verifier.ts
class Verifier {
  constructor(private config: SiteConfig, private sharedBrowser?: Browser) {}
  
  async verify(): Promise<TestResult> {
    const ownsBrowser = !this.sharedBrowser;
    this.browser = this.sharedBrowser || await chromium.launch({ headless: true });
    // ... 验证逻辑 ...
    // finally: only close if we own the browser
    if (ownsBrowser) {
      await this.context?.close();
      await this.browser?.close();
    } else {
      await this.context?.close();
      // 不关 browser，只关 context
    }
  }
}
```

```typescript
// 新文件 src/verifier-pool.ts
export class VerifierPool {
  private browser: Browser | null = null;
  
  async init() { this.browser = await chromium.launch({ headless: true }); }
  async close() { await this.browser?.close(); }
  
  async verify(config: SiteConfig): Promise<TestResult> {
    const verifier = new Verifier(config, this.browser!);
    return verifier.verify();
  }
  
  async verifyAll(configs: SiteConfig[], parallel?: number): Promise<TestResult[]> {
    // 支持并行验证（默认串行，可配置并发数）
  }
}
```

### 2. 🔴 Auth 登录后重置 ConsoleMonitor
**文件**: `src/verifier.ts`
**问题**: 登录阶段的 console error（如 401）被计入目标页面结果
**方案**: 
- `performLogin` 完成后，重置 consoleMonitor（调用 `clearErrors()`）
- 或者在 `performLogin` 之后创建新的 ConsoleMonitor
- 确保 `page.goto(url)` 之前 console 状态干净

```typescript
// 在 performLogin 之后、page.goto(url) 之前
if (this.config.auth) {
  await this.performLogin(timeout);
  consoleMonitor.clearErrors(); // 重置，忽略登录阶段的错误
}
```

### 3. 🔴 修复 viewport 类型
**文件**: `src/types/index.ts` (已完成), `src/verifier.ts`
**问题**: `verifier.ts` 用 `(this.config as any).viewport`，但 viewport 已经在 SiteConfig 里了
**方案**: 直接用 `this.config.viewport`

### 4. 🟡 网络请求检查
**新文件**: `src/checks/network.ts`
**功能**:
- 监听所有网络请求，记录 failed requests（HTTP 4xx/5xx）
- 检测慢请求（可配置阈值，默认 3s）
- 检测资源加载失败（img/script/css 404）
- 在 SiteConfig 中可配置忽略的 URL pattern

```typescript
export interface NetworkResult {
  passed: boolean;
  failedRequests: FailedRequest[];
  slowRequests: SlowRequest[];
  totalRequests: number;
}

export class NetworkMonitor {
  private failedRequests: FailedRequest[] = [];
  private slowRequests: SlowRequest[] = [];
  private slowThreshold: number;
  
  constructor(page: Page, slowThreshold = 3000) {
    page.on('response', (response) => {
      if (response.status() >= 400) {
        this.failedRequests.push({ url: response.url(), status: response.status() });
      }
    });
    page.on('requestfinished', (request) => {
      const timing = request.timing();
      if (timing.responseEnd - timing.requestStart > this.slowThreshold) {
        this.slowRequests.push({ url: request.url(), duration: timing.responseEnd - timing.requestStart });
      }
    });
  }
}
```

在 `checks` 数组中加 `"network"` 选项。

### 5. 🟡 视觉回归对比
**新文件**: `src/checks/visual-regression.ts`
**功能**:
- 保存截图时同时保存 baseline（首次）
- 后续运行时和 baseline 做 pixel diff
- 可配置 diff 阈值（默认 0.1% 即 0.001）
- diff 超阈值生成 diff 图片（红色标记差异区域）
- 报告中包含 diff 百分比

```typescript
export interface VisualRegressionResult {
  passed: boolean;
  diffPercentage: number;
  baselinePath: string;
  diffPath?: string;
  message: string;
}

export class VisualRegressionChecker {
  constructor(private baselineDir: string = 'baselines', private threshold: number = 0.001) {}
  
  async compare(page: Page, name: string): Promise<VisualRegressionResult> {
    // 1. 截图当前页面
    // 2. 检查 baseline 是否存在
    // 3. 不存在 → 保存为 baseline，返回 passed=true
    // 4. 存在 → pixel diff，比较
    // 5. diff < threshold → passed
    // 6. diff >= threshold → 生成 diff 图片，failed
  }
}
```

SiteConfig 中加 `visualRegression?: { enabled: boolean; threshold?: number }`。

### 6. 🟡 性能阈值判定
**文件**: `src/checks/performance.ts`
**当前**: 只收集指标，永远 passed=true
**方案**: 加可配置阈值

```typescript
export interface PerformanceThresholds {
  fcp?: number;     // 默认 3000ms
  lcp?: number;     // 默认 4000ms
  loadTime?: number; // 默认 5000ms
  pageWeight?: number; // 默认 5MB (bytes)
}
```

SiteConfig 中加 `performanceThresholds?: PerformanceThresholds`。
PerformanceChecker.checkThresholds() 返回 pass/fail。

### 7. 🟡 HTML 报告
**新文件**: `src/utils/html-report.ts`
**功能**:
- 生成独立的 HTML 报告文件
- 包含：通过/失败统计、每个站点的检查详情、截图缩略图
- 支持展开/折叠查看详细错误
- 美观的 UI（深色主题）
- 截图可点击放大

在 CLI 的 `--output` 时自动生成 `.html` 文件。

### 8. 🟡 并行验证
**文件**: `src/verifier-pool.ts`
**方案**: 
- `verifyAll(configs, { parallel: 3 })` 用 `Promise.all` + 限制并发
- 简单实现：chunk configs，每批 N 个并行
- 默认并发数 = min(站点数, CPU 核心数, 4)

### 9. 🟡 重试机制
**文件**: `src/verifier.ts`
**方案**: 
- SiteConfig 加 `retries?: number`（默认 0）
- 验证失败时自动重试
- 报告中标记哪些是重试后通过的
- 重试间隔 2s

### 10. 🟢 代码质量
- `runCustomCheck` 参数从 `any` 改为 `CustomCheck`
- 所有 `console.log` 改为可配置的 logger（`src/utils/logger.ts`）
- Console error 截断：单个错误最多 200 字符，总共最多 5 个
- `verify-all.ts` 支持 `{ "sites": [...] }` 格式

## SiteConfig 类型更新

```typescript
export interface SiteConfig {
  name: string;
  url: string;
  expectedStatusCode: number;
  screenshots?: ScreenshotConfig[] | string[];
  viewport?: { width: number; height: number };
  viewports?: ViewportConfig[];
  customChecks?: CustomCheck[];
  checks?: string[];  // 新增可选值: "network", "visual-regression"
  timeout?: number;
  auth?: AuthConfig;
  retries?: number;
  performanceThresholds?: PerformanceThresholds;
  visualRegression?: { enabled: boolean; threshold?: number };
  ignoreUrlPatterns?: string[];  // 网络检查忽略的 URL
}
```

## 实现顺序
1. verifier.ts: 共享浏览器 + auth 后重置 console + viewport 类型修复
2. verifier-pool.ts: 新建，并行验证支持
3. checks/network.ts: 网络请求检查
4. checks/visual-regression.ts: 视觉回归对比
5. checks/performance.ts: 性能阈值判定
6. utils/html-report.ts: HTML 报告
7. verifier.ts: 重试机制
8. CLI 入口更新: 使用 VerifierPool
9. 代码质量: 类型修复 + logger + 截断

## 验证
完成后运行：
```bash
cd /root/.openclaw/workspace/e2e-verifier
npm run build
npm run verify -- --config sites/logmonitor.json
```
所有 logmonitor 页面验证通过即可。
