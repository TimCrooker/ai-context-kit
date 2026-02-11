# CLI Contract

`ai-context` exposes a stable command and exit-code contract.

## Global Exit Codes

- `0`: success
- `1`: command failed validation, generation, verification, or runtime checks

## Commands

### `ai-context init`

- Purpose: scaffold context files from template.
- Flags:
  - `--template <name>`: template name, default `default`
  - `--force`: overwrite existing files
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

- Purpose: diagnose common setup/config issues.
- Success behavior: `0` when no issues found.
- Failure behavior: `1` with `issue:` lines.

### `ai-context lint-config`

- Purpose: validate manifest/scopes/modules wiring.
- Success behavior: `Config lint passed`.
- Failure behavior: `1` with `error:` lines.
