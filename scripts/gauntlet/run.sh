#!/usr/bin/env bash
# Gauntlet: validate cross-CLI skill discovery end-to-end.
# Usage: pnpm gauntlet [--skip-claude] [--skip-codex] [--skip-gemini]
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE="$REPO_ROOT/examples/gauntlet"
RESULTS_DIR="$FIXTURE/results"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$RESULTS_DIR/$TIMESTAMP.md"

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
echo "# Gauntlet run $TIMESTAMP" > "$REPORT"
echo "" >> "$REPORT"

log_stage() {
  local stage="$1"
  local outcome="$2"
  local detail="${3:-}"
  echo "- **$stage**: $outcome" >> "$REPORT"
  if [ -n "$detail" ]; then
    echo "  - $detail" >> "$REPORT"
  fi
  echo "[gauntlet] $stage: $outcome${detail:+ — $detail}"
}

# Build the kit (in case it's stale)
echo "[gauntlet] Building kit..."
cd "$REPO_ROOT"
pnpm build >/dev/null 2>&1 || { log_stage "build kit" "FAIL" "pnpm build errored"; exit 1; }

# Stage 1: Emission test
echo "[gauntlet] Stage 1: emission..."
cd "$FIXTURE"
# Clean previous state
rm -rf .agents/skills .claude/skills apps/api/.agents apps/api/.claude apps/web/.agents apps/web/.claude
node "$REPO_ROOT/packages/cli/dist/index.js" build >/tmp/gauntlet-build.log 2>&1

ASSERT_PATHS=(
  ".agents/skills/plain-skill/SKILL.md"
  ".agents/skills/skill-with-refs/references/notes.md"
  ".agents/skills/skill-with-scripts/scripts/probe.sh"
  ".claude/skills/plain-skill/SKILL.md"
  ".claude/skills/router-skill/SKILL.md"
  "apps/api/.agents/skills/api-scoped-skill/SKILL.md"
  "apps/api/.claude/skills/api-scoped-skill/SKILL.md"
)
ALL_OK=1
MISSING=()
for p in "${ASSERT_PATHS[@]}"; do
  if [ ! -e "$p" ]; then
    MISSING+=("$p")
    ALL_OK=0
  fi
done
if [ "$ALL_OK" = "1" ]; then
  log_stage "Stage 1 emission" "PASS" "all ${#ASSERT_PATHS[@]} paths present"
else
  log_stage "Stage 1 emission" "FAIL" "missing: ${MISSING[*]}"
fi

# Stage 2: Edit propagation
echo "[gauntlet] Stage 2: edit propagation..."
echo "EDIT_VIA_CLAUDE" >> "$FIXTURE/.claude/skills/plain-skill/SKILL.md"
if grep -q "EDIT_VIA_CLAUDE" "$FIXTURE/.ai/skills/plain-skill/SKILL.md"; then
  log_stage "Stage 2 edit propagation" "PASS" "edits to .claude/ landed in .ai/ source"
  # Restore
  sed -i.bak '/^EDIT_VIA_CLAUDE$/d' "$FIXTURE/.ai/skills/plain-skill/SKILL.md" 2>/dev/null && rm -f "$FIXTURE/.ai/skills/plain-skill/SKILL.md.bak"
else
  log_stage "Stage 2 edit propagation" "FAIL" "edit did not propagate"
fi

# Stage 3: Force-copy fallback
echo "[gauntlet] Stage 3: force-copy fallback..."
rm -rf "$FIXTURE/.agents/skills" "$FIXTURE/.claude/skills" "$FIXTURE/apps/api/.agents" "$FIXTURE/apps/api/.claude"
AI_CONTEXT_FORCE_COPY_FALLBACK=1 node "$REPO_ROOT/packages/cli/dist/index.js" build >/tmp/gauntlet-fallback.log 2>&1
if grep -q "<!-- _generated:" "$FIXTURE/.claude/skills/plain-skill/SKILL.md" 2>/dev/null; then
  log_stage "Stage 3 copy fallback" "PASS" "_generated banner present"
else
  log_stage "Stage 3 copy fallback" "FAIL" "banner missing"
fi
# Restore to symlinks
rm -rf "$FIXTURE/.agents/skills" "$FIXTURE/.claude/skills" "$FIXTURE/apps/api/.agents" "$FIXTURE/apps/api/.claude"
node "$REPO_ROOT/packages/cli/dist/index.js" build >/dev/null 2>&1

# Stage 4: Claude headless
if [ "$SKIP_CLAUDE" = "0" ] && command -v claude >/dev/null 2>&1; then
  echo "[gauntlet] Stage 4: Claude headless..."
  CLAUDE_OUT="$RESULTS_DIR/$TIMESTAMP-claude.txt"
  claude -p "List the names of every skill available in this repository. Output only the names, one per line." > "$CLAUDE_OUT" 2>&1 || true
  EXPECTED=("plain-skill" "skill-with-refs" "skill-with-scripts" "router-skill")
  MISSING=()
  for name in "${EXPECTED[@]}"; do
    grep -q "$name" "$CLAUDE_OUT" || MISSING+=("$name")
  done
  if [ "${#MISSING[@]}" = "0" ]; then
    log_stage "Stage 4 Claude discovery" "PASS" "all skills listed"
  else
    log_stage "Stage 4 Claude discovery" "FAIL" "missing: ${MISSING[*]} (transcript: $CLAUDE_OUT)"
  fi
else
  log_stage "Stage 4 Claude discovery" "SKIP" "claude not on PATH or --skip-claude"
fi

# Stage 5: Codex headless
if [ "$SKIP_CODEX" = "0" ] && command -v codex >/dev/null 2>&1; then
  echo "[gauntlet] Stage 5: Codex headless..."
  CODEX_OUT="$RESULTS_DIR/$TIMESTAMP-codex.txt"
  codex exec "List the names of every skill available in this repository. Output only the names, one per line." > "$CODEX_OUT" 2>&1 || true
  EXPECTED=("plain-skill" "skill-with-refs" "skill-with-scripts" "router-skill")
  MISSING=()
  for name in "${EXPECTED[@]}"; do
    grep -q "$name" "$CODEX_OUT" || MISSING+=("$name")
  done
  if [ "${#MISSING[@]}" = "0" ]; then
    log_stage "Stage 5 Codex discovery" "PASS" "all skills listed"
  else
    log_stage "Stage 5 Codex discovery" "FAIL" "missing: ${MISSING[*]} (transcript: $CODEX_OUT)"
  fi
else
  log_stage "Stage 5 Codex discovery" "SKIP" "codex not on PATH or --skip-codex"
fi

# Stage 6: Gemini headless
if [ "$SKIP_GEMINI" = "0" ] && command -v gemini >/dev/null 2>&1; then
  echo "[gauntlet] Stage 6: Gemini headless..."
  GEMINI_OUT="$RESULTS_DIR/$TIMESTAMP-gemini.txt"
  gemini --skip-trust -p "List the names of every skill available in this repository. Output only the names, one per line." > "$GEMINI_OUT" 2>&1 || true
  EXPECTED=("plain-skill" "skill-with-refs" "skill-with-scripts" "router-skill")
  MISSING=()
  for name in "${EXPECTED[@]}"; do
    grep -q "$name" "$GEMINI_OUT" || MISSING+=("$name")
  done
  if [ "${#MISSING[@]}" = "0" ]; then
    log_stage "Stage 6 Gemini discovery" "PASS" "all skills listed"
  else
    log_stage "Stage 6 Gemini discovery" "FAIL" "missing: ${MISSING[*]} (transcript: $GEMINI_OUT)"
  fi
else
  log_stage "Stage 6 Gemini discovery" "SKIP" "gemini not on PATH or --skip-gemini"
fi

# Stage 7: Meta-skill awareness (Claude only — meta-skill not yet seeded in fixture, so this may fail)
if [ "$SKIP_CLAUDE" = "0" ] && command -v claude >/dev/null 2>&1; then
  echo "[gauntlet] Stage 7: meta-skill awareness..."
  META_OUT="$RESULTS_DIR/$TIMESTAMP-claude-meta.txt"
  claude -p "How do I add a new context module to this repo? Cite the file you used." > "$META_OUT" 2>&1 || true
  if grep -q "authoring-modules\|ai-context-kit" "$META_OUT"; then
    log_stage "Stage 7 meta-skill" "PASS" "Claude cited meta-skill content"
  else
    log_stage "Stage 7 meta-skill" "FAIL" "Claude did not cite meta-skill (meta-skill may not be seeded in fixture)"
  fi
else
  log_stage "Stage 7 meta-skill" "SKIP" "claude not available"
fi

echo ""
echo "Report: $REPORT"
cat "$REPORT"
