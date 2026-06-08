You are updating the docs/index.html file for the e2e-verifier project at /root/.openclaw/workspace/e2e-verifier/docs/index.html.

Add a new section "⚡ 快速+深度验证编排" right after the existing "🤖 Agent 深度验证" section. Also add this to the navigation menu.

## Content to add:

### ⚡ 快速+深度验证编排 (Orchestrated Verification)

Explain: 编排层将快速验证（Verifier）和深度验证（Agent Loop）串联成一个自动化流水线。

**工作流程：**
1. 对每个站点运行快速检查（状态码、性能、可访问性、SEO、控制台）
2. 分析检查结果
3. 所有检查通过 → 跳过深度验证，节省Token
4. 有检查失败 → 自动生成诊断任务 → 触发Agent深度验证
5. Agent深入诊断并尝试自动修复
6. 输出统一报告：快速验证 + 深度验证结果汇总

**自动任务生成：**
编排器会从快速检查的失败信息自动生成深度验证任务描述（中文）：
- HTTP 状态码失败 → "验证页面HTTP状态码和导航是否正常"
- 可访问性问题 → "检查页面可访问性问题，特别是[具体错误]"
- 性能指标异常 → "分析页面性能指标，[具体指标]"
- 控制台错误 → "调查控制台错误和警告：[具体错误]"

**CLI 命令：**
| Command | Description |
|---------|-------------|
| verify:orchestrated | 快速+深度编排验证 |

```
npm run verify:orchestrated -- --config sites/quick-check.json
npm run verify:orchestrated -- --config sites/quick-check.json --strict
npm run verify:orchestrated -- --config sites/quick-check.json --deep-model glm-5.1
npm run verify:orchestrated -- --config sites/quick-check.json --skip-deep
```

**Options:**
| Option | Description |
|--------|-------------|
| --config, -c | 站点配置文件（必需） |
| --strict, -s | 非关键失败也触发深度验证 |
| --deep-model, -m | LLM模型（默认: gpt-4o） |
| --output, -o | 输出报告路径 |
| --json, -j | JSON格式输出 |
| --skip-deep | 仅运行快速验证 |

Make it match the existing dark theme. Same CSS variables and styling. Insert the navigation link between "Agent深度验证" and "配置".
