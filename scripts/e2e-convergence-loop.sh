#!/bin/bash
# e2e-convergence-loop.sh — 自动收敛 E2E 测试循环
# 用法: ./e2e-convergence-loop.sh [--max-rounds 5] [--project vault-reader]
# 
# 循环逻辑:
#   1. 运行所有项目测试 → 收集结果
#   2. 分析失败项 → 分类（框架bug / 项目bug / 预期行为）
#   3. 如果有框架bug → 自动修复 → 回到步骤1
#   4. 如果只剩项目bug → 生成修复建议 → 停止
#   5. 如果全部通过 → 停止
#
# 收敛条件:
#   - 连续2轮结果相同（无新增修复）→ 停止
#   - 达到最大轮次 → 停止并报告剩余问题
#   - 全部通过 → 停止并报告成功

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERIFIER_DIR="$SCRIPT_DIR"
MAX_ROUNDS=${MAX_ROUNDS:-5}
PROJECTS_DIR="$VERIFIER_DIR/sites"
RESULTS_BASE="$VERIFIER_DIR/convergence-results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

mkdir -p "$RESULTS_BASE"

# 支持的项目列表
ALL_PROJECTS=("vault-reader" "logmonitor" "depth3d" "webgpu-studio")
PROJECTS=("${ALL_PROJECTS[@]}")

# 解析参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --max-rounds) MAX_ROUNDS="$2"; shift 2 ;;
    --project) PROJECTS=("$2"); shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  E2E Convergence Loop${NC}"
echo -e "${BLUE}  Projects: ${PROJECTS[*]}${NC}"
echo -e "${BLUE}  Max rounds: ${MAX_ROUNDS}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"

# 保存每轮结果用于对比
declare -A PREVIOUS_RESULTS
STABLE_COUNT=0

run_tests_for_project() {
  local project="$1"
  local config="$PROJECTS_DIR/${project}.json"
  local round_dir="$RESULTS_BASE/round-${ROUND}/${project}"
  
  if [[ ! -f "$config" ]]; then
    echo -e "${YELLOW}  ⚠ No config for ${project}, skipping${NC}"
    return
  fi
  
  mkdir -p "$round_dir"
  
  echo -e "  ${BLUE}▶ Running verify: ${project}${NC}"
  cd "$VERIFIER_DIR"
  
  # Run verify
  local verify_result="$round_dir/verify-result.json"
  local verify_exit=0
  npm run verify -- --config "$config" --output "$round_dir" --json 2>"$round_dir/verify-stderr.log" > "$round_dir/verify-stdout.log" || verify_exit=$?
  
  # Extract latest result
  if [[ -f "$round_dir/latest.json" ]]; then
    cp "$round_dir/latest.json" "$verify_result"
  fi
  
  # Run explore (no-llm, fast)
  echo -e "  ${BLUE}▶ Running explore: ${project}${NC}"
  npm run explore -- --config "$config" --no-llm --max-pages 20 --max-depth 2 --output "$round_dir/explore-output" 2>"$round_dir/explore-stderr.log" || true
  
  # Parse results
  local passed=0 failed=0 total=0
  if [[ -f "$verify_result" ]]; then
    passed=$(python3 -c "import json; d=json.load(open('$verify_result')); r=d.get('summary',d); print(r.get('passed', r.get('totalPassed',0)))" 2>/dev/null || echo "?")
    failed=$(python3 -c "import json; d=json.load(open('$verify_result')); r=d.get('summary',d); print(r.get('failed', r.get('totalFailed',0)))" 2>/dev/null || echo "?")
    total=$(python3 -c "import json; d=json.load(open('$verify_result')); r=d.get('summary',d); print(r.get('total', r.get('totalChecks',0)))" 2>/dev/null || echo "?")
  fi
  
  echo -e "  ${GREEN}✓ ${project}: ${passed}/${total} passed, ${failed} failed${NC}"
  
  # Save to project's e2e-test directory
  save_to_project "$project" "$round_dir"
  
  RESULT_STRING="${project}:${passed}/${total}"
}

save_to_project() {
  local project="$1"
  local round_dir="$2"
  
  # Find project source directory
  local project_dir=""
  case "$project" in
    vault-reader) project_dir="/root/.openclaw/workspace/vault-reader-main" ;;
    logmonitor) project_dir="/home/coder/log-monitor" ;;
    depth3d) project_dir="/var/www/depth3d" ;;
    webgpu-studio) project_dir="/home/coder/webgpu-3d-studio" ;;
  esac
  
  local e2e_dir="$project_dir/e2e-test"
  mkdir -p "$e2e_dir"
  
  # Copy results
  [[ -f "$round_dir/verify-result.json" ]] && cp "$round_dir/verify-result.json" "$e2e_dir/result-round-${ROUND}.json"
  [[ -d "$round_dir/explore-output" ]] && cp -r "$round_dir/explore-output" "$e2e_dir/explore-round-${ROUND}/"
  
  echo -e "    ${BLUE}📁 Results saved to ${e2e_dir}/${NC}"
}

analyze_failures() {
  local round="$1"
  local round_dir="$RESULTS_BASE/round-${round}"
  local analysis="$round_dir/analysis.json"
  
  echo -e "\n  ${YELLOW}📊 Analyzing failures...${NC}"
  
  python3 << 'PYEOF'
import json, os, sys

round_dir = os.environ.get("ROUND_DIR", "")
analysis = {"framework_bugs": [], "app_bugs": [], "expected": [], "summary": {}}

for project_dir in os.listdir(round_dir):
    pdir = os.path.join(round_dir, project_dir)
    if not os.path.isdir(pdir):
        continue
    
    verify_result = os.path.join(pdir, "verify-result.json")
    if os.path.exists(verify_result):
        try:
            data = json.load(open(verify_result))
            pages = data.get("pages", data.get("results", []))
            for page in pages:
                checks = page.get("checks", page.get("results", []))
                for check in checks:
                    if not check.get("passed", check.get("success", True)):
                        name = check.get("name", check.get("check", "unknown"))
                        reason = check.get("reason", check.get("error", check.get("message", "")))
                        page_name = page.get("name", page.get("url", ""))
                        
                        # Categorize
                        category = "app_bug"
                        name_lower = name.lower()
                        reason_lower = str(reason).lower()
                        
                        if any(k in name_lower for k in ["accessibility", "seo", "console"]):
                            category = "app_bug"
                        elif any(k in reason_lower for k in ["timeout", "navigate", "selector", "element"]):
                            category = "framework_bug"
                        elif any(k in reason_lower for k in ["webgpu not", "not supported"]):
                            category = "expected"
                        
                        entry = {
                            "project": project_dir,
                            "page": page_name,
                            "check": name,
                            "reason": reason,
                            "category": category
                        }
                        
                        if category == "framework_bug":
                            analysis["framework_bugs"].append(entry)
                        elif category == "expected":
                            analysis["expected"].append(entry)
                        else:
                            analysis["app_bugs"].append(entry)
        except:
            pass
    
    # Also check explore results
    explore_report = os.path.join(pdir, "explore-output", "exploration-report-*.json")
    import glob
    for f in glob.glob(explore_report):
        try:
            data = json.load(open(f))
            summary = data.get("summary", {})
            if summary.get("testsFailed", 0) > 0:
                analysis["app_bugs"].append({
                    "project": project_dir,
                    "page": "explore",
                    "check": f"explore_failed_tests",
                    "reason": f"{summary.get('testsFailed',0)} explore tests failed",
                    "category": "app_bug"
                })
        except:
            pass

analysis["summary"] = {
    "framework_bugs": len(analysis["framework_bugs"]),
    "app_bugs": len(analysis["app_bugs"]),
    "expected": len(analysis["expected"]),
    "total_failures": len(analysis["framework_bugs"]) + len(analysis["app_bugs"])
}

with open(os.path.join(round_dir, "analysis.json"), "w") as f:
    json.dump(analysis, f, indent=2, ensure_ascii=False)

print(f"  Framework bugs: {len(analysis['framework_bugs'])}")
print(f"  App bugs: {len(analysis['app_bugs'])}")
print(f"  Expected (not fixable): {len(analysis['expected'])}")
PYEOF
}

# ═══════════════════════════════════════════════
# Main Loop
# ═══════════════════════════════════════════════

OVERALL_RESULT=""
PREVIOUS_SUMMARY=""

for ((ROUND=1; ROUND<=MAX_ROUNDS; ROUND++)); do
  echo -e "\n${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  Round ${ROUND}/${MAX_ROUNDS}${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  
  ROUND_DIR="$RESULTS_BASE/round-${ROUND}"
  mkdir -p "$ROUND_DIR"
  
  # Run all projects
  CURRENT_SUMMARY=""
  for project in "${PROJECTS[@]}"; do
    run_tests_for_project "$project"
    CURRENT_SUMMARY="${CURRENT_SUMMARY} ${RESULT_STRING}"
  done
  
  # Analyze
  export ROUND_DIR
  analyze_failures "$ROUND"
  
  # Check convergence
  if [[ "$CURRENT_SUMMARY" == "$PREVIOUS_SUMMARY" ]]; then
    STABLE_COUNT=$((STABLE_COUNT + 1))
    echo -e "\n${YELLOW}⚠ Results unchanged for ${STABLE_COUNT} round(s)${NC}"
    if [[ $STABLE_COUNT -ge 2 ]]; then
      echo -e "${GREEN}✅ Converged! No improvement in last 2 rounds.${NC}"
      OVERALL_RESULT="converged"
      break
    fi
  else
    STABLE_COUNT=0
  fi
  
  # Check if all passed
  ANALYSIS="$ROUND_DIR/analysis.json"
  if [[ -f "$ANALYSIS" ]]; then
    TOTAL_FAILURES=$(python3 -c "import json; print(json.load(open('$ANALYSIS'))['summary']['total_failures'])" 2>/dev/null || echo "99")
    if [[ "$TOTAL_FAILURES" == "0" ]]; then
      echo -e "\n${GREEN}🎉 All tests passed!${NC}"
      OVERALL_RESULT="all_passed"
      break
    fi
    
    FRAMEWORK_BUGS=$(python3 -c "import json; print(json.load(open('$ANALYSIS'))['summary']['framework_bugs'])" 2>/dev/null || echo "0")
    if [[ "$FRAMEWORK_BUGS" -gt 0 ]]; then
      echo -e "\n${YELLOW}🔧 Found ${FRAMEWORK_BUGS} framework bugs, fixing needed before next round${NC}"
      echo -e "${YELLOW}   Run: claude -p --permission-mode bypassPermissions \"Fix E2E Verifier framework bugs in $(cat $ANALYSIS)\"${NC}"
      # In auto mode, we'd invoke the fixer here
    fi
  fi
  
  PREVIOUS_SUMMARY="$CURRENT_SUMMARY"
done

# ═══════════════════════════════════════════════
# Final Report
# ═══════════════════════════════════════════════

echo -e "\n${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Final Report${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"

echo "Rounds completed: $ROUND"
echo "Result: ${OVERALL_RESULT:-max_rounds_reached}"
echo ""
echo "Results saved to:"
for project in "${PROJECTS[@]}"; do
  case "$project" in
    vault-reader) dir="/root/.openclaw/workspace/vault-reader-main/e2e-test" ;;
    logmonitor) dir="/home/coder/log-monitor/e2e-test" ;;
    depth3d) dir="/var/www/depth3d/e2e-test" ;;
    webgpu-studio) dir="/home/coder/webgpu-3d-studio/e2e-test" ;;
  esac
  echo "  ${project}: ${dir}/"
done
echo ""
echo "Convergence report: $RESULTS_BASE/convergence-report-${TIMESTAMP}.json"

# Generate convergence report
python3 << PYEOF
import json, os, glob

results_base = "$RESULTS_BASE"
timestamp = "$TIMESTAMP"
report = {"timestamp": timestamp, "rounds": [], "projects": {}}

for round_dir in sorted(glob.glob(os.path.join(results_base, "round-*"))):
    round_num = os.path.basename(round_dir).split("-")[1]
    analysis_file = os.path.join(round_dir, "analysis.json")
    round_data = {"round": int(round_num)}
    
    if os.path.exists(analysis_file):
        analysis = json.load(open(analysis_file))
        round_data["summary"] = analysis["summary"]
        round_data["framework_bugs"] = analysis["framework_bugs"]
        round_data["app_bugs"] = analysis["app_bugs"]
    
    results["rounds"].append(round_data)

with open(os.path.join(results_base, f"convergence-report-{timestamp}.json"), "w") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
PYEOF

echo -e "\n${GREEN}Done.${NC}"
