#!/usr/bin/env bash
set -euo pipefail

# Self-test the migrate flow against a temporary copy of the gauntlet fixture.
# Verifies the entire plan -> apply cycle works end-to-end.

KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d -t aickit-migrate-test-XXXXXX)"
trap "rm -rf $TEST_DIR" EXIT

# Create a minimal legacy repo: skills at .claude/skills/<name>/ (real dirs, NOT symlinks)
# No .ai/skills/, no .agents/skills/
mkdir -p "$TEST_DIR/repo"
cd "$TEST_DIR/repo"

# Set up the minimal manifest
mkdir -p .ai/context/modules
cat > .ai/context/modules/010-overview.md << 'MODEOF'
---
id: overview
targets: [root]
order: 10
---

# Overview
MODEOF

cat > .ai/context/scopes.json << 'SCOPEOF'
{"version": 1, "scopes": []}
SCOPEOF

cat > .ai/context/manifest.json << 'MANEOF'
{
  "version": 1,
  "modulesDir": ".ai/context/modules",
  "scopesFile": ".ai/context/scopes.json",
  "targets": {"root": "AGENTS.md"},
  "skills": {"source": ".ai/skills", "mirrors": [".agents/skills", ".claude/skills"], "metaSkill": true}
}
MANEOF

# Copy SKILL.md sources from the gauntlet fixture as legacy directories under .claude/skills/
mkdir -p .claude/skills
for skill in plain-skill skill-with-refs skill-with-scripts router-skill; do
  if [ -d "$KIT_ROOT/examples/gauntlet/.ai/skills/$skill" ]; then
    cp -R "$KIT_ROOT/examples/gauntlet/.ai/skills/$skill/" ".claude/skills/$skill/"
  fi
done

# Set up git
git init -q
git config user.email migrate-test@example.com
git config user.name "Migrate Test"
git add -A
git commit -q -m "initial legacy layout"

echo "=== Legacy layout created: $(ls .claude/skills/ | wc -l | tr -d ' ') skills in .claude/skills/ ==="

# Run the migration
node "$KIT_ROOT/packages/cli/dist/index.js" migrate plan
echo "=== Plan generated ==="
node "$KIT_ROOT/packages/cli/dist/index.js" migrate status

node "$KIT_ROOT/packages/cli/dist/index.js" migrate apply
echo "=== Apply complete ==="

# Check skills in the right place
FAILED=0
for skill in plain-skill skill-with-refs skill-with-scripts router-skill; do
  if [ ! -f ".ai/skills/$skill/SKILL.md" ]; then
    echo "FAIL: $skill not migrated to .ai/skills/"
    FAILED=1
  else
    echo "OK: .ai/skills/$skill/SKILL.md exists"
  fi
  if [ ! -L ".agents/skills/$skill" ]; then
    echo "FAIL: .agents/skills/$skill is not a symlink"
    FAILED=1
  else
    echo "OK: .agents/skills/$skill is a symlink"
  fi
  if [ ! -L ".claude/skills/$skill" ]; then
    echo "FAIL: .claude/skills/$skill is not a symlink"
    FAILED=1
  else
    echo "OK: .claude/skills/$skill is a symlink"
  fi
done

if [ "$FAILED" = "1" ]; then
  echo ""
  echo "Migrate self-test FAILED."
  exit 1
fi

echo ""
echo "Migrate self-test PASSED."
