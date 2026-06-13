# R012: 可视化对比增强 + 性能基准 + 导出报告

你正在 e2e-verifier 项目中工作。这是一个基于 Playwright 的 E2E 验证框架，包含 Express API 服务器和 Dashboard。

## 重要约束
- 不要修改已有文件的核心逻辑，只做增量添加
- 所有新代码必须通过 TypeScript 编译（tsc --noEmit）
- 所有新功能必须有对应的测试
- 不要引入新的 npm 依赖（只用已有的）
- 保持代码风格与项目一致（Express routes pattern、service pattern）

## 任务 1：可视化对比增强

### 新建文件 `src/services/visual-comparator.ts`
```typescript
// 核心接口和类：
export interface IgnoreRegion {
  selector?: string;   // CSS selector
  x?: number;          // 或坐标框选
  y?: number;
  width?: number;
  height?: number;
  label?: string;      // 区域标签
}

export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  severity: number;    // 0-1 差异严重程度
  label?: string;
}

export interface DiffResult {
  totalPixels: number;
  diffPixels: number;
  diffPercentage: number;
  regions: DiffRegion[];
  heatmapBase64?: string;  // base64 编码的热力图 PNG
  ignoredRegions: IgnoreRegion[];
}

export class VisualComparator {
  private ignoreRegions: Map<string, IgnoreRegion[]> = new Map(); // site -> regions

  setIgnoreRegions(site: string, regions: IgnoreRegion[]): void;
  getIgnoreRegions(site: string): IgnoreRegion[];
  
  // 像素级对比，生成 diff 区域和热力图
  compare(
    baseline: Buffer,
    current: Buffer,
    options?: {
      threshold?: number;        // 像素差异阈值 (0-255)
      regionSize?: number;       // 区域分块大小 (默认 16)
      generateHeatmap?: boolean; // 是否生成热力图
    }
  ): DiffResult;
  
  // 从 DiffResult 生成热力图
  generateHeatmap(baseline: Buffer, diffRegions: DiffRegion[]): Buffer;
}
```

实现要点：
- 使用 Node.js Buffer 操作像素数据（解析 PNG 宽高从 buffer 前8字节）
- 区域感知：将图片分块（默认16x16），计算每块的差异均值
- 热力图：根据区域差异程度用不同颜色标记（绿=无差异，黄=轻微，红=严重）
- 忽略区域检查：检查坐标是否在忽略区域内

### 新建文件 `src/server/routes/visual-routes.ts`
```typescript
// 路由：
// POST /api/config/ignore-regions  — body: { site, regions: IgnoreRegion[] }
// GET  /api/config/ignore-regions?site=xxx — 获取忽略区域
// POST /api/results/:jobId/diff-heatmap — body: { baseline, current } → 返回热力图
```

pattern 参考 `src/server/routes/comparison-routes.ts`。导出 `createVisualRoutes(storageService: StorageService): Router`。

## 任务 2：性能基准

### 新建文件 `src/services/performance-benchmark.ts`
```typescript
export interface StepTiming {
  step: string;       // navigate | interact | screenshot | compare
  duration: number;   // ms
  timestamp: string;  // ISO date
}

export interface PerformanceRecord {
  jobId: string;
  site: string;
  steps: StepTiming[];
  totalDuration: number;
  timestamp: string;
}

export interface PerformanceBaseline {
  site: string;
  stepBaselines: { [step: string]: { mean: number; stdDev: number; min: number; max: number; samples: number } };
  updatedAt: string;
}

export interface PerformanceRegression {
  step: string;
  baseline: number;
  actual: number;
  zScore: number;
  severity: 'warning' | 'critical';
  jobId: string;
  timestamp: string;
}

export class PerformanceBenchmark {
  private records: Map<string, PerformanceRecord[]> = new Map(); // site -> records
  private baselines: Map<string, PerformanceBaseline> = new Map();

  recordPerformance(rec: PerformanceRecord): void;
  
  // 计算并更新基线（需要至少3个样本）
  computeBaseline(site: string): PerformanceBaseline;
  getBaseline(site: string): PerformanceBaseline | null;
  
  // 检测回归：某步骤耗时超出基线 2σ
  detectRegressions(site: string): PerformanceRegression[];
  
  // 获取历史记录
  getHistory(site: string, limit?: number): PerformanceRecord[];
}
```

实现要点：
- 基线计算：mean = 平均值, stdDev = 标准差, 用 Welford 算法或简单公式
- 回归检测：zScore = (actual - mean) / stdDev，|zScore| > 2 时标记
- severity: |zScore| > 3 = critical, > 2 = warning

### 新建文件 `src/server/routes/benchmark-routes.ts`
```typescript
// 路由：
// GET /api/benchmarks/:site — 获取性能基线
// GET /api/benchmarks/:site/regressions — 性能回归列表
// GET /api/benchmarks/:site/history — 历史记录
// POST /api/benchmarks/:site/record — 提交性能记录
```

导出 `createBenchmarkRoutes(storageService: StorageService): Router`。

## 任务 3：报告导出

### 新建文件 `src/services/report-exporter.ts`
```typescript
export type ExportFormat = 'pdf' | 'md' | 'csv';

export interface ReportData {
  jobId: string;
  site: string;
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
  failures: { step: string; expected: string; actual: string; severity: string }[];
  performance?: { step: string; duration: number }[];
  trend?: { date: string; passRate: number }[];
}

export class ReportExporter {
  // Markdown 报告
  exportMarkdown(data: ReportData): string;
  
  // CSV 数据导出
  exportCSV(data: ReportData): string;
  
  // HTML 报告（用于 PDF 渲染或直接查看）
  exportHTML(data: ReportData): string;
  
  // PDF 导出 — 返回 HTML 字符串，由路由层用 puppeteer 渲染
  // 注意：不引入新依赖，如果 puppeteer 不可用则返回 HTML
  exportPDFReady(data: ReportData): string;
}
```

实现要点：
- Markdown：用模板字符串生成标准 MD，包含表格、统计摘要
- CSV：标准 CSV 格式，逗号分隔，引号转义
- HTML：完整的 HTML 页面，内联 CSS，适合打印/PDF

### 新建文件 `src/server/routes/export-routes.ts`
```typescript
// 路由：
// GET /api/results/:jobId/export?format=pdf|md|csv
// 返回相应格式的文件
```

导出 `createExportRoutes(storageService: StorageService, jobService: JobService): Router`。

## 任务 4：注册路由

修改 `src/server/verify-server.ts`：
1. 在 import 区域添加：
```typescript
import { createVisualRoutes } from './routes/visual-routes';
import { createBenchmarkRoutes } from './routes/benchmark-routes';
import { createExportRoutes } from './routes/export-routes';
```

2. 在路由注册区域（约 line 230 附近）添加：
```typescript
this.app.use('/api', createVisualRoutes(this.storageService));
this.app.use('/api', createBenchmarkRoutes(this.storageService));
this.app.use('/api', createExportRoutes(this.storageService, this.jobService));
```

## 任务 5：测试

### 新建 `tests/visual-comparator.test.ts`
- 测试 setIgnoreRegions / getIgnoreRegions
- 测试 compare：用模拟数据验证 diffPercentage 计算
- 测试区域感知分块
- 测试忽略区域过滤
- 至少 5 个测试用例

### 新建 `tests/performance-benchmark.test.ts`
- 测试 recordPerformance / getHistory
- 测试 computeBaseline（均值、标准差计算正确性）
- 测试 detectRegressions（2σ 检测）
- 测试样本不足时不计算基线
- 至少 5 个测试用例

### 新建 `tests/report-exporter.test.ts`
- 测试 exportMarkdown 输出包含关键字段
- 测试 exportCSV 格式正确（header + rows）
- 测试 exportHTML 包含基本结构
- 测试空数据时不出错
- 至少 4 个测试用例

## 任务 6：Dashboard 增强

修改 `dashboard/index.html`，在现有 dashboard 中添加：

1. **Diff 对比区域**：添加忽略区域配置面板（输入 selector/坐标，显示已配置区域列表）
2. **性能基准页面**：添加一个 section 显示性能趋势（用简单的 HTML/CSS bar chart 或 ASCII 风格，不需要 Chart.js）
3. **报告导出按钮**：在结果区域添加三个按钮（PDF / MD / CSV），点击时调用对应 API

保持单文件 HTML dashboard 风格一致。

## 最终检查清单

完成后运行以下命令确保全部通过：
```bash
npm run build
npx tsc --noEmit
npm test
```

三个命令都必须 exit 0。如果有错误，修复后重新运行直到全部通过。
