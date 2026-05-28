# @timothycrooker/ai-context-cli

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
