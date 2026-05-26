#!/usr/bin/env bash
set -uo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <EPMX-repo-path> [--skip-claude] [--skip-codex] [--skip-gemini]" >&2
  exit 1
fi

EPMX_ROOT="$1"
shift
KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RESULTS_DIR="$EPMX_ROOT/examples/gauntlet/results"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$RESULTS_DIR/epmx-$TIMESTAMP.md"

SKIP_CLAUDE=0
SKIP_CODEX=0
SKIP_GEMINI=0
for arg in "$@"; do
  case "$arg" in
    --skip-claude) SKIP_CLAUDE=1 ;;
    --skip-codex) SKIP_CODEX=1 ;;
    --skip-gemini) SKIP_GEMINI=1 ;;
  esac
done

mkdir -p "$RESULTS_DIR"
echo "# EPMX Gauntlet run $TIMESTAMP" > "$REPORT"
echo "" >> "$REPORT"
echo "Kit version: $(node "$KIT_ROOT/packages/cli/dist/index.js" --version 2>/dev/null || echo 'unknown')" >> "$REPORT"
echo "" >> "$REPORT"

log_stage() {
  local stage="$1" outcome="$2" detail="${3:-}"
  echo "- **$stage**: $outcome" >> "$REPORT"
  [ -n "$detail" ] && echo "  - $detail" >> "$REPORT"
  echo "[epmx-gauntlet] $stage: $outcome${detail:+ — $detail}"
}

# Stage 1: Emission
cd "$EPMX_ROOT"
EXPECTED_AGENTS_SKILLS=$(ls -1 .agents/skills 2>/dev/null | wc -l | tr -d ' ')
EXPECTED_CLAUDE_SKILLS=$(ls -1 .claude/skills 2>/dev/null | wc -l | tr -d ' ')
if [ "$EXPECTED_AGENTS_SKILLS" -ge "30" ] && [ "$EXPECTED_CLAUDE_SKILLS" -ge "30" ]; then
  log_stage "Stage 1 emission" "PASS" "$EXPECTED_AGENTS_SKILLS .agents/skills/ + $EXPECTED_CLAUDE_SKILLS .claude/skills/"
else
  log_stage "Stage 1 emission" "FAIL" "expected ~39 in each, got $EXPECTED_AGENTS_SKILLS / $EXPECTED_CLAUDE_SKILLS"
fi

# Stage 2: Per-CLI sample discovery
SAMPLE_SKILLS=("encompass-api" "roam-api" "max-as-consultant" "backlog-triage" "ai-context-kit")
check_discovery() {
  local cli_name="$1" out="$2"
  local missing=()
  for s in "${SAMPLE_SKILLS[@]}"; do
    grep -q "$s" "$out" || missing+=("$s")
  done
  if [ "${#missing[@]}" = "0" ]; then
    log_stage "Stage 2 $cli_name discovery" "PASS" "all sample skills listed"
  else
    log_stage "Stage 2 $cli_name discovery" "FAIL" "missing: ${missing[*]} (transcript: $out)"
  fi
}

if [ "$SKIP_CLAUDE" = "0" ] && command -v claude >/dev/null 2>&1; then
  CLAUDE_OUT="$RESULTS_DIR/epmx-$TIMESTAMP-claude.txt"
  claude -p "List every skill available in this repository. Output only names, one per line." > "$CLAUDE_OUT" 2>&1 || true
  check_discovery "Claude" "$CLAUDE_OUT"
fi

if [ "$SKIP_CODEX" = "0" ] && command -v codex >/dev/null 2>&1; then
  CODEX_OUT="$RESULTS_DIR/epmx-$TIMESTAMP-codex.txt"
  codex exec "List every skill available. Output only names, one per line." > "$CODEX_OUT" 2>&1 || true
  check_discovery "Codex" "$CODEX_OUT"
fi

if [ "$SKIP_GEMINI" = "0" ] && command -v gemini >/dev/null 2>&1; then
  GEMINI_OUT="$RESULTS_DIR/epmx-$TIMESTAMP-gemini.txt"
  gemini --skip-trust -p "List every skill available. Output only names, one per line." > "$GEMINI_OUT" 2>&1 || true
  check_discovery "Gemini" "$GEMINI_OUT"
fi

# Stage 3: Meta-skill awareness (Claude)
if [ "$SKIP_CLAUDE" = "0" ] && command -v claude >/dev/null 2>&1; then
  META_OUT="$RESULTS_DIR/epmx-$TIMESTAMP-claude-meta.txt"
  claude -p "How do I add a new context module to this repo? Cite the file you used." > "$META_OUT" 2>&1 || true
  if grep -q "authoring-modules\|ai-context-kit" "$META_OUT"; then
    log_stage "Stage 3 meta-skill awareness" "PASS"
  else
    log_stage "Stage 3 meta-skill awareness" "FAIL" "Claude did not cite meta-skill (transcript: $META_OUT)"
  fi
fi

echo ""
echo "Report: $REPORT"
cat "$REPORT"
