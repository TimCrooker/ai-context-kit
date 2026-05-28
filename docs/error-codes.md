# Error Codes

`ai-context-kit` uses typed `ContextError` codes for machine-readable diagnostics.

## Stable Codes

- `AICTX_CONFIG_INVALID`
  - Invalid manifest/scopes/module schema or incompatible field values.
- `AICTX_CONFIG_MISSING`
  - Missing required manifest, scopes, or modules paths.
- `AICTX_FRONT_MATTER_INVALID`
  - Invalid or missing module front matter.
- `AICTX_GENERATION_INVALID`
  - Invalid generation graph or output construction issue.
- `AICTX_INIT_FAILED`
  - Initialization failure (for example existing file without `--force`).
- `AICTX_INTERNAL`
  - Fallback code for uncategorized internal failures.

## Skill Error Codes

- `AICTX_SKILL_FRONTMATTER_INVALID`
  - A skill's `SKILL.md` frontmatter is malformed or missing required fields (`name`, `description`). Fix the YAML block; verify that both required fields are present.
- `AICTX_SKILL_NAME_INVALID`
  - Skill name violates the pattern `/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/`, exceeds 64 chars, or doesn't match its directory name. Rename the directory to match.
- `AICTX_SKILL_MISSING_FILE`
  - A directory under `manifest.skills.source` lacks a `SKILL.md`. Add one or remove the empty directory.
- `AICTX_SKILL_SCOPE_UNKNOWN`
  - A skill's frontmatter `scope: [id]` references a scope ID that doesn't exist in `manifest.json` targets. Either add the scope target or fix the skill's frontmatter.
- `AICTX_SKILL_MIRROR_CONFLICT`
  - A real file or directory exists at a target mirror path, blocking the kit from creating a symlink. Either delete that path or move the skill source.
- `AICTX_SKILL_MIRROR_BROKEN`
  - A mirror symlink points at a missing target (the source skill was deleted). Run `ai-context build --remove-orphans`.

### Migrate subsystem (`AICTX_MIGRATE_*`)

- `AICTX_MIGRATE_PLAN_EXISTS`
  - A migration plan already exists at `.ai/migration-plan.json`. Use `--force` to overwrite, or `ai-context migrate clean` if the previous plan was applied.
- `AICTX_MIGRATE_PLAN_NOT_FOUND`
  - No migration plan found. Run `ai-context migrate plan` first.
- `AICTX_MIGRATE_PLAN_INVALID`
  - The migration plan file at `.ai/migration-plan.json` is not valid JSON. Delete it and regenerate with `ai-context migrate plan`.
- `AICTX_MIGRATE_NO_SKILLS_BLOCK`
  - The manifest does not have a `skills` block. Run `ai-context init --upgrade` to add one before applying a migration plan.
- `AICTX_MIGRATE_DIRTY_TREE`
  - The git working tree has uncommitted changes. Commit or stash all changes before running `ai-context migrate apply`.
- `AICTX_MIGRATE_NOT_GIT_REPO`
  - The current directory is not a git repository. Migration requires git for history-preserving file moves.
- `AICTX_MIGRATE_ENTRY_FAILED`
  - A migration entry failed to apply. The migration is halted at that entry. Fix the issue and re-run `ai-context migrate apply` (it will skip already-applied entries).
- `AICTX_MIGRATE_ALREADY_APPLIED`
  - Raised by `ai-context migrate clean` when the plan has not been applied yet. Apply the plan first, or delete the plan file manually.

## CLI Formatting

When a `ContextError` reaches CLI handlers, it is rendered as:

```text
[<CODE>] <message>
```
