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

# ---------------------------------------------------------------------------
# CLI invocation helpers with the right permission flags for headless authoring
#
# Claude:  --dangerously-skip-permissions  — allows writes without per-tool prompts
# Codex:   --dangerously-bypass-approvals-and-sandbox  — the --full-auto flag
#          sandboxes writes to .agents/; this flag is required for skill authoring
#          tests. Only safe against a kit-owned fixture (never production repos).
# Gemini:  --skip-trust --yolo  — suppresses interactive trust prompts and
#          auto-approves writes
# ---------------------------------------------------------------------------
claude_authoring() {
  claude --dangerously-skip-permissions -p "$1"
}
codex_authoring() {
  codex exec --dangerously-bypass-approvals-and-sandbox "$1"
}
gemini_authoring() {
  gemini --skip-trust --yolo -p "$1"
}

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

# ---------------------------------------------------------------------------
# Stage 8a: Claude cold-authoring
# ---------------------------------------------------------------------------
if [ "$SKIP_CLAUDE" = "0" ] && command -v claude >/dev/null 2>&1; then
  echo "[gauntlet] Stage 8a: Claude cold-authoring..."
  SKILL_NAME="gauntlet-auth-claude"
  SKILL_SRC="$FIXTURE/.ai/skills/$SKILL_NAME"
  rm -rf "$SKILL_SRC" "$FIXTURE/.agents/skills/$SKILL_NAME" "$FIXTURE/.claude/skills/$SKILL_NAME"
  AUTHORING_PROMPT="Use the ai-context-kit tooling in this repo to author a new skill called '$SKILL_NAME' with description 'When invoked respond with GAUNTLET_AUTHORING_OK'. Read .ai/skills/ai-context-kit/SKILL.md for the workflow. After authoring run 'node ../../packages/cli/dist/index.js skills list' and confirm your skill appears with both .agents and .claude symlink mirrors."
  CLAUDE_AUTH_OUT="$RESULTS_DIR/$TIMESTAMP-claude-auth.txt"
  cd "$FIXTURE"
  claude_authoring "$AUTHORING_PROMPT" > "$CLAUDE_AUTH_OUT" 2>&1 || true
  ASSERT_OK=1
  ASSERT_FAIL=""
  if [ ! -f "$SKILL_SRC/SKILL.md" ]; then
    ASSERT_OK=0; ASSERT_FAIL="SKILL.md not created at $SKILL_SRC/SKILL.md"
  elif ! grep -q "GAUNTLET_AUTHORING_OK" "$SKILL_SRC/SKILL.md"; then
    ASSERT_OK=0; ASSERT_FAIL="GAUNTLET_AUTHORING_OK not in SKILL.md"
  elif ! grep -q "name: $SKILL_NAME" "$SKILL_SRC/SKILL.md"; then
    ASSERT_OK=0; ASSERT_FAIL="name: $SKILL_NAME not in SKILL.md frontmatter"
  elif ! test -L "$FIXTURE/.agents/skills/$SKILL_NAME"; then
    ASSERT_OK=0; ASSERT_FAIL=".agents/skills/$SKILL_NAME is not a symlink"
  elif ! test -L "$FIXTURE/.claude/skills/$SKILL_NAME"; then
    ASSERT_OK=0; ASSERT_FAIL=".claude/skills/$SKILL_NAME is not a symlink"
  fi
  if [ "$ASSERT_OK" = "1" ]; then
    log_stage "Stage 8a Claude authoring" "PASS" "skill created with correct content and mirrors"
  else
    log_stage "Stage 8a Claude authoring" "FAIL" "$ASSERT_FAIL (transcript: $CLAUDE_AUTH_OUT)"
  fi
  # NOTE: Do NOT clean up gauntlet-auth-claude yet — Stage 11 uses it
else
  log_stage "Stage 8a Claude authoring" "SKIP" "claude not on PATH or --skip-claude"
fi

# ---------------------------------------------------------------------------
# Stage 11: Cross-CLI discovery of Claude-authored skill
# Must run while gauntlet-auth-claude is still in place from Stage 8a
# ---------------------------------------------------------------------------
echo "[gauntlet] Stage 11: cross-CLI discovery of Claude-authored skill..."
CROSS_SKILL="gauntlet-auth-claude"
for cross_cli in codex gemini; do
  CROSS_SKIP_VAR="SKIP_$(echo "$cross_cli" | tr '[:lower:]' '[:upper:]')"
  CROSS_SKIP="${!CROSS_SKIP_VAR}"
  if [ "$CROSS_SKIP" = "0" ] && command -v "$cross_cli" >/dev/null 2>&1; then
    CROSS_OUT="$RESULTS_DIR/$TIMESTAMP-cross-$cross_cli.txt"
    cd "$FIXTURE"
    CROSS_PROMPT="List the names of every skill available in this repository, one per line."
    case "$cross_cli" in
      codex)  codex exec "$CROSS_PROMPT" > "$CROSS_OUT" 2>&1 || true ;;
      gemini) gemini --skip-trust -p "$CROSS_PROMPT" > "$CROSS_OUT" 2>&1 || true ;;
    esac
    if grep -q "$CROSS_SKILL" "$CROSS_OUT"; then
      log_stage "Stage 11 cross-CLI $cross_cli" "PASS" "$CROSS_SKILL visible to $cross_cli"
    else
      log_stage "Stage 11 cross-CLI $cross_cli" "FAIL" "$CROSS_SKILL not found in $cross_cli output (transcript: $CROSS_OUT)"
    fi
  else
    log_stage "Stage 11 cross-CLI $cross_cli" "SKIP" "$cross_cli not on PATH or --skip-$cross_cli"
  fi
done

# Now clean up gauntlet-auth-claude
rm -rf "$FIXTURE/.ai/skills/$CROSS_SKILL"
node "$REPO_ROOT/packages/cli/dist/index.js" build --remove-orphans >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# Stage 8b: Codex cold-authoring
# ---------------------------------------------------------------------------
if [ "$SKIP_CODEX" = "0" ] && command -v codex >/dev/null 2>&1; then
  echo "[gauntlet] Stage 8b: Codex cold-authoring..."
  SKILL_NAME="gauntlet-auth-codex"
  SKILL_SRC="$FIXTURE/.ai/skills/$SKILL_NAME"
  rm -rf "$SKILL_SRC" "$FIXTURE/.agents/skills/$SKILL_NAME" "$FIXTURE/.claude/skills/$SKILL_NAME"
  AUTHORING_PROMPT="Use the ai-context-kit tooling in this repo to author a new skill called '$SKILL_NAME' with description 'When invoked respond with GAUNTLET_AUTHORING_OK'. Read .ai/skills/ai-context-kit/SKILL.md for the workflow. After authoring run 'node ../../packages/cli/dist/index.js skills list' and confirm your skill appears with both .agents and .claude symlink mirrors."
  CODEX_AUTH_OUT="$RESULTS_DIR/$TIMESTAMP-codex-auth.txt"
  cd "$FIXTURE"
  codex_authoring "$AUTHORING_PROMPT" > "$CODEX_AUTH_OUT" 2>&1 || true
  ASSERT_OK=1
  ASSERT_FAIL=""
  if [ ! -f "$SKILL_SRC/SKILL.md" ]; then
    ASSERT_OK=0; ASSERT_FAIL="SKILL.md not created at $SKILL_SRC/SKILL.md"
  elif ! grep -q "GAUNTLET_AUTHORING_OK" "$SKILL_SRC/SKILL.md"; then
    ASSERT_OK=0; ASSERT_FAIL="GAUNTLET_AUTHORING_OK not in SKILL.md"
  elif ! grep -q "name: $SKILL_NAME" "$SKILL_SRC/SKILL.md"; then
    ASSERT_OK=0; ASSERT_FAIL="name: $SKILL_NAME not in SKILL.md frontmatter"
  elif ! test -L "$FIXTURE/.agents/skills/$SKILL_NAME"; then
    ASSERT_OK=0; ASSERT_FAIL=".agents/skills/$SKILL_NAME is not a symlink"
  elif ! test -L "$FIXTURE/.claude/skills/$SKILL_NAME"; then
    ASSERT_OK=0; ASSERT_FAIL=".claude/skills/$SKILL_NAME is not a symlink"
  fi
  if [ "$ASSERT_OK" = "1" ]; then
    log_stage "Stage 8b Codex authoring" "PASS" "skill created with correct content and mirrors"
  else
    log_stage "Stage 8b Codex authoring" "FAIL" "$ASSERT_FAIL (transcript: $CODEX_AUTH_OUT)"
  fi
  rm -rf "$FIXTURE/.ai/skills/$SKILL_NAME"
  node "$REPO_ROOT/packages/cli/dist/index.js" build --remove-orphans >/dev/null 2>&1 || true
else
  log_stage "Stage 8b Codex authoring" "SKIP" "codex not on PATH or --skip-codex"
fi

# ---------------------------------------------------------------------------
# Stage 8c: Gemini cold-authoring
# ---------------------------------------------------------------------------
if [ "$SKIP_GEMINI" = "0" ] && command -v gemini >/dev/null 2>&1; then
  echo "[gauntlet] Stage 8c: Gemini cold-authoring..."
  SKILL_NAME="gauntlet-auth-gemini"
  SKILL_SRC="$FIXTURE/.ai/skills/$SKILL_NAME"
  rm -rf "$SKILL_SRC" "$FIXTURE/.agents/skills/$SKILL_NAME" "$FIXTURE/.claude/skills/$SKILL_NAME"
  AUTHORING_PROMPT="Use the ai-context-kit tooling in this repo to author a new skill called '$SKILL_NAME' with description 'When invoked respond with GAUNTLET_AUTHORING_OK'. Read .ai/skills/ai-context-kit/SKILL.md for the workflow. After authoring run 'node ../../packages/cli/dist/index.js skills list' and confirm your skill appears with both .agents and .claude symlink mirrors."
  GEMINI_AUTH_OUT="$RESULTS_DIR/$TIMESTAMP-gemini-auth.txt"
  cd "$FIXTURE"
  gemini_authoring "$AUTHORING_PROMPT" > "$GEMINI_AUTH_OUT" 2>&1 || true
  ASSERT_OK=1
  ASSERT_FAIL=""
  if [ ! -f "$SKILL_SRC/SKILL.md" ]; then
    ASSERT_OK=0; ASSERT_FAIL="SKILL.md not created at $SKILL_SRC/SKILL.md"
  elif ! grep -q "GAUNTLET_AUTHORING_OK" "$SKILL_SRC/SKILL.md"; then
    ASSERT_OK=0; ASSERT_FAIL="GAUNTLET_AUTHORING_OK not in SKILL.md"
  elif ! grep -q "name: $SKILL_NAME" "$SKILL_SRC/SKILL.md"; then
    ASSERT_OK=0; ASSERT_FAIL="name: $SKILL_NAME not in SKILL.md frontmatter"
  elif ! test -L "$FIXTURE/.agents/skills/$SKILL_NAME"; then
    ASSERT_OK=0; ASSERT_FAIL=".agents/skills/$SKILL_NAME is not a symlink"
  elif ! test -L "$FIXTURE/.claude/skills/$SKILL_NAME"; then
    ASSERT_OK=0; ASSERT_FAIL=".claude/skills/$SKILL_NAME is not a symlink"
  fi
  if [ "$ASSERT_OK" = "1" ]; then
    log_stage "Stage 8c Gemini authoring" "PASS" "skill created with correct content and mirrors"
  else
    log_stage "Stage 8c Gemini authoring" "FAIL" "$ASSERT_FAIL (transcript: $GEMINI_AUTH_OUT)"
  fi
  rm -rf "$FIXTURE/.ai/skills/$SKILL_NAME"
  node "$REPO_ROOT/packages/cli/dist/index.js" build --remove-orphans >/dev/null 2>&1 || true
else
  log_stage "Stage 8c Gemini authoring" "SKIP" "gemini not on PATH or --skip-gemini"
fi

# ---------------------------------------------------------------------------
# Stage 9: Reference loading per CLI
# ---------------------------------------------------------------------------
echo "[gauntlet] Stage 9: reference loading..."
for refs_cli in claude codex gemini; do
  REF_SKIP_VAR="SKIP_$(echo "$refs_cli" | tr '[:lower:]' '[:upper:]')"
  REF_SKIP="${!REF_SKIP_VAR}"
  if [ "$REF_SKIP" = "0" ] && command -v "$refs_cli" >/dev/null 2>&1; then
    REFS_OUT="$RESULTS_DIR/$TIMESTAMP-$refs_cli-refs.txt"
    cd "$FIXTURE"
    REFS_PROMPT="Invoke the skill-with-refs skill — it tells you to read references/notes.md and respond with the literal first line. Respond with just that line."
    case "$refs_cli" in
      claude) claude -p "$REFS_PROMPT" > "$REFS_OUT" 2>&1 || true ;;
      codex)  codex exec "$REFS_PROMPT" > "$REFS_OUT" 2>&1 || true ;;
      gemini) gemini --skip-trust -p "$REFS_PROMPT" > "$REFS_OUT" 2>&1 || true ;;
    esac
    if grep -q "GAUNTLET_REFS_OK" "$REFS_OUT"; then
      log_stage "Stage 9 $refs_cli refs" "PASS" "GAUNTLET_REFS_OK in output"
    else
      log_stage "Stage 9 $refs_cli refs" "FAIL" "GAUNTLET_REFS_OK not found (transcript: $REFS_OUT)"
    fi
  else
    log_stage "Stage 9 $refs_cli refs" "SKIP" "$refs_cli not on PATH or --skip-$refs_cli"
  fi
done

# ---------------------------------------------------------------------------
# Stage 10: Script execution per CLI
# ---------------------------------------------------------------------------
echo "[gauntlet] Stage 10: script execution..."
for scripts_cli in claude codex gemini; do
  SCR_SKIP_VAR="SKIP_$(echo "$scripts_cli" | tr '[:lower:]' '[:upper:]')"
  SCR_SKIP="${!SCR_SKIP_VAR}"
  if [ "$SCR_SKIP" = "0" ] && command -v "$scripts_cli" >/dev/null 2>&1; then
    SCRIPTS_OUT="$RESULTS_DIR/$TIMESTAMP-$scripts_cli-scripts.txt"
    cd "$FIXTURE"
    SCRIPTS_PROMPT="Invoke the skill-with-scripts skill — it tells you to execute scripts/probe.sh and respond with the stdout. Respond with just the output."
    case "$scripts_cli" in
      claude) claude -p "$SCRIPTS_PROMPT" > "$SCRIPTS_OUT" 2>&1 || true ;;
      codex)  codex exec "$SCRIPTS_PROMPT" > "$SCRIPTS_OUT" 2>&1 || true ;;
      gemini) gemini --skip-trust -p "$SCRIPTS_PROMPT" > "$SCRIPTS_OUT" 2>&1 || true ;;
    esac
    if grep -q "GAUNTLET_SCRIPT_OK" "$SCRIPTS_OUT"; then
      log_stage "Stage 10 $scripts_cli scripts" "PASS" "GAUNTLET_SCRIPT_OK in output"
    else
      log_stage "Stage 10 $scripts_cli scripts" "FAIL" "GAUNTLET_SCRIPT_OK not found (transcript: $SCRIPTS_OUT)"
    fi
  else
    log_stage "Stage 10 $scripts_cli scripts" "SKIP" "$scripts_cli not on PATH or --skip-$scripts_cli"
  fi
done

echo ""
echo "Report: $REPORT"
cat "$REPORT"
