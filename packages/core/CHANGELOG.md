# @timothycrooker/ai-context-core

## 1.2.0

### Minor Changes

- d58b0ee: Add a unified MCP layer — MCP is now a third generated primitive alongside context and skills.

  Declare MCP servers once in `.ai/mcp.json`; `ai-context build` fans them out to each agent client's native config (Claude `.mcp.json`, Codex `.codex/config.toml`). Servers can carry backing: a linked skill (auto by co-name or explicit) and a one-line catalog entry in `AGENTS.md`/`CLAUDE.md` so an agent gets the tool and the knowledge to use it.
  - `project`-scope servers are committed; `user`-scope servers install per-machine via `ai-context mcp install <name> --user`.
  - Secrets stay as `${VAR}` references (resolved from `.ai/secrets.local.env`); `ai-context verify` fails on a credential literal in a generated config.
  - New CLI: `ai-context mcp list | install --user | setup`.
  - v1 ships `claude` + `codex` adapters behind a pluggable registry.

## 1.1.0

### Minor Changes

- 9074b1b: Add migrate CLI subsystem and ai-context-migrate skill (1.1.0).

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

## 1.0.0

### Major Changes

- ae6d237: Add first-class cross-CLI skills + context injection (1.0.0).

  **New:**
  - `.ai/skills/<name>/` directory-tree skill authoring (SKILL.md + optional references/, scripts/, assets/)
  - Double-symlink emission to `.agents/skills/<name>` (read by Codex, Gemini, Cursor, Goose, OpenCode, Aider, +18 other agents.md-compatible tools) and `.claude/skills/<name>` (read by Claude Code)
  - Monorepo per-scope skills via frontmatter `scope: [api, web]`
  - Windows copy-fallback with `_generated:` banner
  - `ai-context skills create` and `ai-context skills list` subcommands
  - `ai-context init --upgrade` for adding skills to existing 0.3.x repos without overwriting content
  - `ai-context init --refresh-meta-skill` to refresh the bundled meta-skill
  - Kit's own `ai-context-kit` meta-skill installed in every consuming repo (SKILL.md + 6 reference docs + helper script)
  - Lean kit-awareness stanza in generated `AGENTS.md`/`CLAUDE.md` pointing agents at the meta-skill

  **Backward compatibility:**

  Manifests without a `skills` block behave exactly as 0.3.x. Existing CLAUDE.md/AGENTS.md generation unchanged. `.claude/rules/*.md` generation unchanged. No breaking changes to the 0.3.x manifest schema — the `skills` field is purely additive.

  **Validation:**

  Empirically validated via `examples/gauntlet/` exercising every skill shape (plain SKILL.md, with-refs, with-scripts, scoped, router) across **headless Claude/Codex/Gemini invocations — 7/7 stages pass**. Results committed at `examples/gauntlet/results/`. Run `pnpm gauntlet` to reproduce.

## 0.3.0

### Minor Changes

- d631332: Add content best practices: writing guide, standard/monorepo templates with auto-detection, and content quality linting in doctor.

## 0.2.2

### Patch Changes

- Production hardening release:
  - structured `ContextError` codes and formatting helpers
  - stronger config/front-matter validation
  - deterministic markdown generation improvements
  - orphan detection for generated markdown outputs
  - expanded automated test coverage and coverage thresholds

## 0.2.0

### Minor Changes

- bec7a19: Initial public release for the ai-context-kit package family.
