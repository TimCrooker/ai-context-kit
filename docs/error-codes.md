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

## CLI Formatting

When a `ContextError` reaches CLI handlers, it is rendered as:

```text
[<CODE>] <message>
```
