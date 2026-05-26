---
"@timothycrooker/ai-context-core": minor
"@timothycrooker/ai-context-cli": minor
"@timothycrooker/ai-context-templates": minor
"@timothycrooker/ai-context-config": minor
---

Add migrate CLI subsystem and ai-context-migrate skill (1.1.0).

**New:**
- `ai-context migrate plan` — audit legacy skill layout, generate `.ai/migration-plan.json`
- `ai-context migrate status` — report plan presence + applied state
- `ai-context migrate apply [--dry-run]` — execute the plan (per-entry git commits, git-clean precondition)
- `ai-context migrate clean` — remove applied plan file
- Bundled `ai-context-migrate` skill (SKILL.md + 4 reference docs: overlap-detection, family-routing, legacy-md-conversion, post-migration-verification)
- EPMX-adapted gauntlet at `scripts/epmx-gauntlet/run.sh`
- Self-test at `scripts/test-migrate-on-gauntlet.sh`

**Backward compatibility:**

Migrate is opt-in. Existing repos without legacy skills are unaffected. The new `ai-context-migrate` skill ships in templates alongside `ai-context-kit`. No breaking changes.

**Validation:**

Migrated EPMX Monorepo's 40-entry legacy layout to `.ai/skills/` source-of-truth. EPMX gauntlet passes all stages across Claude/Codex/Gemini ([EPMX PR #511](https://github.com/Empowering-People-More/EPMX-Monorepo/pull/511)).
