/**
 * Test Plan Parser — 解析项目维护的 test-plan.yaml
 * 
 * 每个 project/e2e-test/test-plan.yaml 声明：
 * - 环境配置（URL、认证）
 * - 依赖准备（造流量、启动服务）
 * - 测试场景（页面、步骤、预期）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Logger } from '../utils/logger';

const logger = new Logger({ prefix: 'TestPlanParser' });

// ========== Types ==========

export interface TestPlan {
  project: string;
  version: string;
  environment: EnvironmentConfig;
  dependencies?: Dependency[];
  scenarios: Scenario[];
}

export interface EnvironmentConfig {
  base_url: string;
  api_url?: string;
  auth: AuthConfig;
}

export type AuthConfig = FormLoginAuth | TokenAuth | NoAuth;

export interface FormLoginAuth {
  type: 'form_login';
  login_url: string;
  username_field: string;
  password_field: string;
  submit_button: string;
  credentials: { username: string; password: string };
}

export interface TokenAuth {
  type: 'token';
  header: string;
  value: string;
}

export interface NoAuth {
  type: 'none';
}

export interface Dependency {
  type: 'traffic' | 'service' | 'script';
  description: string;
  target?: string;
  actions?: string[];
  script?: string;
  /** ms to wait after executing */
  wait_after?: number;
}

export interface Scenario {
  name: string;
  pages: string[];
  /** If set, only run after this dependency completes */
  precondition?: string;
  steps: TestStep[];
  validation?: ValidationCheck[];
  /** Timeout for entire scenario (ms) */
  timeout?: number;
}

export interface TestStep {
  action: string;
  /** CSS selector or description */
  target?: string;
  /** Input value for search/type actions */
  input?: string;
  /** Additional parameters */
  [key: string]: any;
  /** Expected outcome */
  expect?: string;
}

export interface ValidationCheck {
  type: 'api_check' | 'element_check' | 'custom';
  endpoint?: string;
  endpoint_pattern?: string;
  selector?: string;
  /** JavaScript expression to evaluate */
  assert?: string;
  description?: string;
}

// ========== Parser ==========

/**
 * Parse a test-plan.yaml file
 */
export function parseTestPlan(yamlPath: string): TestPlan {
  if (!fs.existsSync(yamlPath)) {
    throw new Error(`Test plan not found: ${yamlPath}`);
  }

  const raw = fs.readFileSync(yamlPath, 'utf-8');
  const plan = yaml.load(raw) as any;

  // Validate required fields
  if (!plan.project) throw new Error('test-plan.yaml missing: project');
  if (!plan.environment) throw new Error('test-plan.yaml missing: environment');
  if (!plan.environment.base_url) throw new Error('test-plan.yaml missing: environment.base_url');
  if (!plan.scenarios || !Array.isArray(plan.scenarios)) throw new Error('test-plan.yaml missing: scenarios');

  logger.info(`Parsed test plan: ${plan.project} v${plan.version || '1.0'}, ${plan.scenarios.length} scenarios`);
  return plan as TestPlan;
}

/**
 * Find test plan for a project directory
 */
export function findTestPlan(projectDir: string): string | null {
  const candidates = [
    path.join(projectDir, 'e2e-test', 'test-plan.yaml'),
    path.join(projectDir, 'e2e-test', 'test-plan.yml'),
    path.join(projectDir, 'test-plan.yaml'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ========== Simple YAML Parser ==========
// (No dependency on yaml library — just enough for test-plan format)

function parseSimpleYaml(text: string): any {
  const lines = text.split('\n');
  const root: any = {};
  const stack: Array<{ obj: any; indent: number; key?: string }> = [{ obj: root, indent: -1 }];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip comments and empty lines
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Pop stack to find parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    // Parse key: value
    if (trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIdx).trim();
      let value: any = trimmed.substring(colonIdx + 1).trim();

      // Skip if key starts with - (list item with key)
      if (key === '') {
        i++;
        continue;
      }

      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Check if value is a list indicator
      if (value === '' || value === null) {
        // Look ahead for list or nested object
        const nextLine = lines[i + 1];
        if (nextLine && nextLine.trim().startsWith('- ')) {
          // It's a list
          const list: any[] = [];
          parent[key] = list;
          i++;
          while (i < lines.length) {
            const l = lines[i];
            if (!l || (l.search(/\S/) < indent + 2 && l.trim() && !l.trim().startsWith('-'))) break;
            const lt = l.trim();
            if (lt.startsWith('- ')) {
              const itemRaw = lt.substring(2).trim();
              // Check if it's a complex list item (contains : on same line or multi-line)
              if (itemRaw.includes(':')) {
                // Parse as inline object or multi-line object
                const itemObj = parseInlineObject(itemRaw);
                // Look ahead for more properties of this list item
                i++;
                while (i < lines.length) {
                  const nl = lines[i];
                  if (!nl) break;
                  const ni = nl.search(/\S/);
                  if (ni <= indent + 2) break;
                  if (nl.trim().startsWith('- ')) break;
                  const nlt = nl.trim();
                  if (nlt.includes(':')) {
                    const [nk, ...nv] = nlt.split(':');
                    const nval = nv.join(':').trim().replace(/^['"]|['"]$/g, '');
                    itemObj[nk.trim()] = parseValue(nval);
                  }
                  i++;
                }
                list.push(itemObj);
                continue;
              } else {
                list.push(parseValue(itemRaw));
              }
            }
            i++;
          }
          continue;
        } else {
          // Nested object
          parent[key] = {};
          stack.push({ obj: parent[key], indent: indent });
          i++;
          continue;
        }
      }

      parent[key] = parseValue(value);
    }

    i++;
  }

  return root;
}

function parseInlineObject(text: string): any {
  const obj: any = {};
  // Split by comma or just parse single key: value
  const parts = text.split(',').map(s => s.trim());
  for (const part of parts) {
    if (part.includes(':')) {
      const [k, ...v] = part.split(':');
      obj[k.trim()] = parseValue(v.join(':').trim());
    }
  }
  return obj;
}

function parseValue(val: string): any {
  if (!val || val === '') return '';
  val = val.trim();
  if ((val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null') return null;
  if (/^\d+$/.test(val)) return parseInt(val, 10);
  if (/^\d+\.\d+$/.test(val)) return parseFloat(val);
  return val;
}
