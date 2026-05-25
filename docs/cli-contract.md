# CLI Contract

`ai-context` exposes a stable command and exit-code contract.

## Global Exit Codes

- `0`: success
- `1`: command failed validation, generation, verification, or runtime checks

## Commands

### `ai-context init`

- Purpose: scaffold context files from template.
- Flags:
  - `--template <name>`: template name, auto-detected if omitted (`standard` or `monorepo`)
  - `--force`: overwrite existing files
- Auto-detection: when `--template` is omitted, detects `monorepo` if `turbo.json` exists or `turbo` is in `package.json` devDependencies; otherwise uses `standard`.
- Success output: `created: <path>` lines + final template confirmation.

### `ai-context templates`

- Purpose: list template names.
- Success output: one template name per line.

### `ai-context build`

- Purpose: generate scoped outputs.
- Flags:
  - `--check`: fail if generated output differs from disk
  - `--dry-run`: show planned changes without writing
  - `--remove-orphans`: remove generated markdown files no longer managed
- Failure behavior:
  - returns `1` when `--check` finds drift
  - returns `1` for config/content validation errors

### `ai-context verify`

- Purpose: run config lint + build drift + orphan + budget checks.
- Flags:
  - `--strict-codex-config`: fail if `.codex/config.toml` is missing `project_doc_max_bytes`
- Failure behavior: returns `1` on any verification error.

### `ai-context diff`

- Purpose: report pending generated changes.
- Success behavior:
  - `0` with `No generated changes` when clean
  - `1` and itemized output when drift exists

### `ai-context doctor`

- Purpose: diagnose common setup/config issues and content quality.
- Checks:
  - Config validation and scope wiring (from `verify`)
  - **Content quality** (advisory suggestions, not errors):
    - Rule files missing `## Gotchas` or `## Verification` sections
    - Rule files with thin content (< 5 substantive lines)
    - Rule files containing placeholder markers (`TODO`, `FIXME`, `PLACEHOLDER`)
    - Root-targeted modules exceeding 80 lines
- Success behavior: `0` when no issues found. Content suggestions printed as `note:` lines.
- Failure behavior: `1` with `issue:` lines.

### `ai-context lint-config`

- Purpose: validate manifest/scopes/modules wiring.
- Success behavior: `Config lint passed`.
- Failure behavior: `1` with `error:` lines.

### `ai-context skills list`

- Purpose: list discovered skills with their mirror status.
- Exit codes: `0` on success, `1` on error.
- Default output: human-readable text — one skill per block with `name`, `description`, `scope` tag, `source` path, and mirror states.
- `--json` flag: emits valid JSON with shape `{skills: [{name, description, scope, source, mirrors: [{path, state}]}]}`. `state` is one of `symlink | copy | missing`.
- When the manifest has no `skills` block: prints `No skills configured (manifest.skills absent).` (or `{skills: []}` with `--json`).

### `ai-context skills create <name>`

- Purpose: scaffold `.ai/skills/<name>/SKILL.md`, then run `ai-context build` to create mirror symlinks.
- Required args: `name` — kebab-case, max 64 chars, must match `/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/`.
- Flags:
  - `--description <text>`: sets the skill description (defaults to a placeholder if omitted).
  - `--scope <id>`: repeatable; emits mirrors to that scope's mirror locations instead of root. Use `*` for all scopes.
  - `--with-references`: scaffolds `references/example.md` alongside `SKILL.md`.
  - `--with-scripts`: scaffolds `scripts/example.sh` with exec bit set.
- Exit 1 on: invalid name, missing manifest, manifest without `skills` block, or skill source already exists.

### `ai-context init --upgrade`

- Purpose: non-destructive upgrade for existing 0.3.x repos adding the skills subsystem.
- Writes only files that don't yet exist; preserves all existing manifest, scopes, and modules content.
- After writing new files, runs `ai-context build` non-fatally to materialize any new mirrors.

### `ai-context init --refresh-meta-skill`

- Purpose: used together with `--upgrade`; forces overwrite of files under `.ai/skills/ai-context-kit/` even if they already exist.
- Refreshes the meta-skill content from the latest `@timothycrooker/ai-context-templates` package.
- All other existing files are still preserved (only the meta-skill directory is overwritten).
