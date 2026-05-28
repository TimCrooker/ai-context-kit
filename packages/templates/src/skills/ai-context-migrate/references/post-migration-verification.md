# Post-migration verification

After `ai-context migrate apply` completes, run this checklist.

## Mandatory checks (must pass before considering migration complete)

1. **Build is clean**
   ```bash
   ai-context build
   ```
   Expected: exit 0, mirror symlinks updated to reflect the new layout.

2. **Verify passes**
   ```bash
   ai-context verify
   ```
   Expected: exit 0, no errors.

3. **Doctor reports no issues**
   ```bash
   ai-context doctor
   ```
   Expected: "No issues detected" on the issues line. Warnings about thin content are OK.

4. **All skills listed correctly**
   ```bash
   ai-context skills list
   ```
   Expected: every migrated skill shows `symlink` for both mirror states. If any show `copy` (Windows fallback) or `missing`, investigate.

5. **Git history preserved**
   ```bash
   git log --follow -- .ai/skills/<some-migrated-skill>/SKILL.md | head -20
   ```
   Expected: history extends BEFORE the migration commits. If history starts at the migration commit, `git mv` failed silently — investigate.

## Optional checks (highly recommended)

6. **Headless CLI discovery** — for each CLI:
   ```bash
   claude --dangerously-skip-permissions -p "List every skill available in this repo by name, one per line."
   codex exec --dangerously-bypass-approvals-and-sandbox "List every skill ..."
   gemini --skip-trust --yolo -p "List every skill ..."
   ```
   Expected: each CLI lists ALL migrated skills.

7. **Reference loading still works**
   - Pick a migrated skill that has a `references/` dir
   - Ask the agent to invoke it and load a specific reference
   - Expected: reference content surfaces in the response

8. **Script execution still works**
   - Pick a migrated skill that has a `scripts/` dir
   - Ask the agent to invoke it and run a script
   - Expected: script output surfaces

## Rollback

If anything is broken:
```bash
git log --oneline | head -20    # find the pre-migration commit
git reset --hard <pre-migration-sha>
```
Each entry's migration was a separate commit, so partial rollback is possible.
