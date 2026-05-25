# CLI Commands

All commands are invoked as `ai-context <subcommand>`.

## `init`

Scaffold a new project with ai-context-kit config files.

```bash
ai-context init
ai-context init --template monorepo
ai-context init --force
ai-context init --upgrade
ai-context init --refresh-meta-skill
```

| Flag | Behavior |
|---|---|
| `--template <name>` | Template to apply. Defaults to `auto` (auto-detected). Run `ai-context templates` to list options. |
| `--force` | Overwrite existing files. Without this, the command refuses to clobber anything. |
| `--upgrade` | Additive mode: write only files that don't yet exist. Preserves your edits. Safe to run at any time. |
| `--refresh-meta-skill` | In upgrade mode, also overwrite the `ai-context-kit` meta-skill files even if they already exist. Use when updating to a newer kit version. |

`--upgrade` and `--force` are mutually exclusive. Use `--upgrade` for day-to-day updates; `--force` only when starting fresh.

---

## `templates`

List available template names.

```bash
ai-context templates
```

---

## `build`

Regenerate all outputs: AGENTS.md, CLAUDE.md, `.claude/rules/*.md`, and skill mirrors.

```bash
ai-context build
ai-context build --check
ai-context build --dry-run
ai-context build --remove-orphans
```

| Flag | Behavior |
|---|---|
| `--check` | Fail with exit 1 if any output is out of date. Does not write files. CI-friendly. |
| `--dry-run` | Calculate what would change and print it; don't write anything. |
| `--remove-orphans` | Delete generated files and skill mirror symlinks that no longer have a source. |

**Standard workflow**:
```bash
ai-context build               # after editing .ai/ sources
ai-context build --check       # in CI pre-merge gate
ai-context build --remove-orphans  # after deleting a module or skill
```

---

## `verify`

Run `build --check` plus budget checks. The strictest CI gate.

```bash
ai-context verify
ai-context verify --strict-codex-config
```

| Flag | Behavior |
|---|---|
| `--strict-codex-config` | Require `.codex/config.toml` with `project_doc_max_bytes`. Without this flag, missing config emits a warning rather than an error. |

Exits 1 if any output is stale, any budget is exceeded, or (with `--strict-codex-config`) the Codex config is missing.

---

## `diff`

Preview what `build` would change. Exits 1 if there are pending changes.

```bash
ai-context diff
```

Prints one line per file that would be created, updated, or deleted. Use before committing to confirm outputs are up to date, or in pre-commit hooks.

---

## `doctor`

Diagnose configuration and mirror issues with actionable suggestions.

```bash
ai-context doctor
```

Checks for: missing manifest, stale outputs, broken skill mirror symlinks, orphaned mirrors, and content quality issues. Prints `issue:` lines for problems and `suggestion:` lines for fixes. Exits 1 if issues are found.

Run this when `ai-context build` fails or mirrors look wrong.

---

## `lint-config`

Validate manifest structure, scope wiring, and module frontmatter.

```bash
ai-context lint-config
```

Catches: invalid JSON schema, missing required fields, unknown scope IDs referenced in skills, module frontmatter mismatches. Exits 1 on any error. Faster than `verify` — no file writes, no budget checks.

---

## `skills list`

List discovered skills with their mirror states.

```bash
ai-context skills list
ai-context skills list --json
```

| Flag | Behavior |
|---|---|
| `--json` | Emit newline-delimited JSON for machine consumption |

Each row shows skill name, description excerpt, scope, and the status of each mirror path (`symlink`, `copy`, `missing`, or `conflict`).

---

## `skills create`

Scaffold a new skill directory with a valid `SKILL.md`.

```bash
ai-context skills create my-skill --description "Use when doing X."
ai-context skills create my-skill --description "..." --scope api --scope web
ai-context skills create my-skill --description "..." --with-references --with-scripts
```

| Flag | Behavior |
|---|---|
| `--description <text>` | Skill description (required; 1–1024 chars). Written into SKILL.md frontmatter. |
| `--scope <id>` | Limit mirrors to this scope. Repeatable. Omit for root-only emission. |
| `--with-references` | Scaffold an empty `references/` directory inside the skill directory. |
| `--with-scripts` | Scaffold an empty `scripts/` directory inside the skill directory. |

After scaffolding, the command runs `ai-context build` to create mirrors immediately. The skill is ready to use.
