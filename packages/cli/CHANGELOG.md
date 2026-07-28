# @timothycrooker/ai-context-cli

## 1.3.1

### Patch Changes

- e34d1e2: Require `ai-context-core@^1.4.0`, the release that rejects non-root module targets instead of silently dropping the module.

  The old `^1.3.0` range admits 1.4.0, so a fresh install already picked up the fix — but an existing lockfile stays pinned to 1.3.0 and keeps the silent-drop behavior with no signal that anything is stale. `pnpm update` will not move a transitive-only dependency, so consumers had no ordinary upgrade path short of a manual override. Bumping the CLI gives them one: upgrading the package they actually depend on now pulls the fixed core.

  Templates raised to `^1.1.3` for the same reason — that release carries the corrected meta-skill docs, which previously documented module `targets` behavior that was never implemented.

## 1.3.0

### Minor Changes

- 4caf665: Per-skill agent targeting — restrict a skill to specific agents' mirror directories.

  Skills can now declare `agents:` (whitelist) or `excludeAgents:` (blacklist, mutually exclusive) in SKILL.md frontmatter. Agent IDs derive from each `manifest.skills.mirrors` path's first segment minus the leading dot (`.claude/skills` → `claude`, `.agents/skills` → `agents`), so a claude-only skill is simply `agents: [claude]` — it emits to `.claude/skills/` but stays invisible to Codex and other consumers of `.agents/skills/`.
  - Unknown agent IDs fail the build with the new `AICTX_SKILL_AGENT_UNKNOWN` error.
  - Orphan detection is now plan-aware: adding a filter to an existing skill and running `ai-context build --remove-orphans` deletes the now-excluded mirrors; `doctor` flags them.
  - `ai-context skills create` gains a repeatable `--agents <id>` flag; `skills list` shows the filter and includes `agents`/`excludeAgents` in `--json` output.

### Patch Changes

- Updated dependencies [4caf665]
  - @timothycrooker/ai-context-core@1.3.0
  - @timothycrooker/ai-context-templates@1.1.2

## 1.2.0

### Minor Changes

- d58b0ee: Add a unified MCP layer — MCP is now a third generated primitive alongside context and skills.

  Declare MCP servers once in `.ai/mcp.json`; `ai-context build` fans them out to each agent client's native config (Claude `.mcp.json`, Codex `.codex/config.toml`). Servers can carry backing: a linked skill (auto by co-name or explicit) and a one-line catalog entry in `AGENTS.md`/`CLAUDE.md` so an agent gets the tool and the knowledge to use it.
  - `project`-scope servers are committed; `user`-scope servers install per-machine via `ai-context mcp install <name> --user`.
  - Secrets stay as `${VAR}` references (resolved from `.ai/secrets.local.env`); `ai-context verify` fails on a credential literal in a generated config.
  - New CLI: `ai-context mcp list | install --user | setup`.
  - v1 ships `claude` + `codex` adapters behind a pluggable registry.

### Patch Changes

- Updated dependencies [d58b0ee]
  - @timothycrooker/ai-context-core@1.2.0
  - @timothycrooker/ai-context-templates@1.1.1

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

### Patch Changes

- Updated dependencies [9074b1b]
  - @timothycrooker/ai-context-core@1.1.0
  - @timothycrooker/ai-context-templates@1.1.0

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

### Patch Changes

- Updated dependencies [ae6d237]
  - @timothycrooker/ai-context-core@1.0.0
  - @timothycrooker/ai-context-templates@1.0.0

## 0.3.0

### Minor Changes

- d631332: Add content best practices: writing guide, standard/monorepo templates with auto-detection, and content quality linting in doctor.

### Patch Changes

- Updated dependencies [d631332]
  - @timothycrooker/ai-context-core@0.3.0
  - @timothycrooker/ai-context-templates@0.3.0

## 0.2.2

### Patch Changes

- Production hardening release:
  - CLI version now resolves dynamically from package metadata
  - structured core error formatting surfaced in CLI output
  - added CLI version contract tests
  - updated dependencies:
    - @timothycrooker/ai-context-core@0.2.2
    - @timothycrooker/ai-context-templates@0.2.2

## 0.2.0

### Minor Changes

- bec7a19: Initial public release for the ai-context-kit package family.

### Patch Changes

- Updated dependencies [bec7a19]
  - @timothycrooker/ai-context-core@0.2.0
  - @timothycrooker/ai-context-templates@0.2.0
