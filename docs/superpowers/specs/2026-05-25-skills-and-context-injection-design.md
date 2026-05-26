# ai-context-kit 1.0: Skills + Cross-CLI Context Injection

**Status:** Draft for review
**Date:** 2026-05-25
**Owner:** Tim Crooker
**Target release:** `@timothycrooker/ai-context-{core,cli,templates,config}@1.0.0`

---

## 1. Summary

`ai-context-kit` 1.0 adds first-class **skill** authoring on top of the existing AGENTS.md / CLAUDE.md generation. Skills are authored once at `.ai/skills/<name>/` (a directory tree of any shape: `SKILL.md` + optional `references/`, `scripts/`, `assets/`) and discoverable from every agent CLI on the agents.md compatibility list (Codex, Gemini, Cursor, Goose, OpenCode, Aider, Zed, Warp, Junie, Devin, +13 others) plus Claude Code. The kit also ships its own `ai-context-kit` meta-skill so any agent that opens a kit-using repo immediately learns how to author modules, scopes, and skills — solving the "context injection" gap that today requires reading the README before the agent is useful.

## 2. Motivation

Two gaps in the current kit:

1. **Skill capabilities are absent.** The kit generates AGENTS.md/CLAUDE.md root + scoped files, but agents authored once in a kit-using repo aren't usable across CLIs. Today in EPMX, 31 skills live only in `.claude/skills/<name>/SKILL.md` and are invisible to Codex/Gemini agents working in the same repo. 6 skills are manually symlinked between `.agents/skills/` and `.claude/skills/` — proving the model works, but requiring hand-maintenance per skill.
2. **Self-discovery is missing.** When a repo adopts the kit, agents that subsequently open the repo have no built-in way to learn what the kit is or how to use it. The generated AGENTS.md/CLAUDE.md describe project-specific context, not the kit itself. An agent asked to "add a new context module" today must read `docs/content-guide.md` manually first.

The fix is one feature: a skills subsystem that (a) makes "author once, available to all CLIs" the default, and (b) ships the kit's own knowledge as a built-in skill that lands in every kit-using repo.

## 3. Mental model

One rule explains every directory the kit touches:

> **`.ai/` is the authoring surface. Everything else is mirrors the kit maintains for you.**

| Directory | Role | Who edits | Who reads |
|---|---|---|---|
| `.ai/context/` | Module + scope source for `AGENTS.md`/`CLAUDE.md` generation | You | Kit (during `build`) |
| `.ai/skills/` | Skill source (directory trees, agentskills.io spec) | You | Kit (manages mirrors) |
| `.agents/skills/<name>` | **Symlink** → `../../.ai/skills/<name>` | Edit-anywhere lands at source (shared inode) | 23+ agent CLIs per agents.md (Codex, Gemini, Cursor, Goose, OpenCode, Aider, Zed, Warp, Junie, Devin, ...) |
| `.claude/skills/<name>` | **Symlink** → `../../.ai/skills/<name>` | Same inode | Claude Code only |
| `.claude/rules/<name>.md` | Generated path-glob rule (unchanged) | Kit owns | Claude Code only |
| `AGENTS.md`, `CLAUDE.md` (root + scoped) | Generated from `.ai/context/` (kit's existing behavior, extended with meta-skill stanza) | Kit owns | Everyone |

`.ai/` exists because it's the kit's home. `.agents/` and `.claude/` exist because CLIs disagree on where to look. Symlinks mean editing in any of the three locations updates the one underlying file — there is no risk of divergence and no "did I edit the source or the copy?" question.

## 4. Architecture

### 4.1 Source layout

```
<repo>/
├── .ai/
│   ├── context/                  ← unchanged from 0.3.0
│   │   ├── modules/*.md
│   │   ├── scopes/*.md
│   │   ├── references/*.md
│   │   ├── schemas/{manifest,scopes}.schema.json
│   │   ├── manifest.json
│   │   └── scopes.json
│   └── skills/                   ← NEW in 1.0
│       └── <skill-name>/
│           ├── SKILL.md          ← required, agentskills.io frontmatter
│           ├── references/       ← optional, any content
│           ├── scripts/          ← optional, any content (exec bits preserved)
│           └── assets/           ← optional, any content
├── .agents/skills/               ← symlinks created by `ai-context build`
└── .claude/skills/               ← symlinks created by `ai-context build`
```

`.ai/skills/` is a peer to `.ai/context/`, not a child. Skills are conceptually different from context modules (skills are standalone units invoked on demand; context modules are aggregated into root files). The flat layout reflects that.

### 4.2 What lives inside a `<skill-name>/` directory

Per the [agentskills.io](https://agentskills.io/specification) spec, plus what the kit observes from real EPMX usage:

- **`SKILL.md` (required).** YAML frontmatter (at minimum `name`, `description`) + markdown body. Frontmatter may include any agentskills.io-spec field; Claude/Codex/Gemini specific extensions go under `metadata.<cli-name>.*` per the spec.
- **`references/` (optional, any depth).** Long-form supporting docs loaded on demand by the skill body via relative-path references.
- **`scripts/` (optional, any depth, any language).** Executable helpers. Through symlinks, the mirror inherits the source's exec bits automatically (POSIX semantics). On Windows copy-fallback, the kit calls `chmod +x` on `.sh`, `.bash`, `.zsh`, `.py`, `.rb` files in the copied tree so scripts remain runnable from POSIX consumers of a fallback-built repo.
- **`assets/` (optional).** Static files (templates, fixtures, sample data) the skill body references.
- **Anything else.** The kit treats the directory as opaque — whatever the author puts inside is preserved through the symlink. No file-list manifest required.

### 4.3 Symlink emission contract

On `ai-context build`, for each `<name>` under `.ai/skills/`:

1. Compute target mirror paths from manifest's `skills.mirrors` (default `[".agents/skills", ".claude/skills"]`).
2. For each mirror path: if `<mirror>/<name>` does not exist, create it as a directory symlink to `<relative-path-to>/.ai/skills/<name>`. If it exists as a symlink and points elsewhere, repair. If it exists as a real directory (not a symlink), error with `SKILL_MIRROR_CONFLICT` and instructions to either delete it or run `ai-context skills:adopt` (a future helper, out of scope for 1.0 — for 1.0 the user resolves manually).
3. For each mirror path: scan for existing entries whose source no longer exists in `.ai/skills/` and remove them when `--remove-orphans` is set (matches existing engine behavior for generated files).

Symlink targets are always relative paths (`../../.ai/skills/<name>` from `.agents/skills/<name>`), so the repo is portable across clone locations.

### 4.4 Monorepo scoping (the "nested skills" case)

A skill may declare per-scope emission in its frontmatter:

```yaml
---
name: api-conventions
description: Backend HTTP API conventions for this monorepo's Express service
scope: [api]              # emits to <scope-target>/.agents/skills/ + <scope-target>/.claude/skills/
---
```

When `scope:` is set, mirror creation happens at each scope target's root in addition to (or instead of, see below) the repo root.

- `scope: []` (or absent) → root mirrors only (`.agents/skills/<name>`, `.claude/skills/<name>`)
- `scope: [api]` → mirrors at `apps/api/.agents/skills/<name>` and `apps/api/.claude/skills/<name>` only
- `scope: [api, web]` → mirrors at both scopes
- `scope: ["*"]` → all defined scopes plus root (explicit "everywhere")

The scope IDs match `scopes.json` scope IDs. The kit validates that referenced scope IDs exist during `lint-config`.

Per-scope mirrors are still symlinks pointing back to the same root `.ai/skills/<name>` source. There is exactly one source per skill, regardless of how many mirror locations it lands in.

This maps cleanly to Claude's documented behavior: "When you work with files in subdirectories below your starting directory, Claude Code also discovers skills from nested `.claude/skills/` directories on demand." Codex's `.agents/skills/` discovery walks the same way. A `scope: [api]` skill is visible to any CLI session whose cwd is under `apps/api/`.

### 4.5 Windows fallback

Symlinks on Windows require either Developer Mode or `core.symlinks=true` on clone. When symlink creation fails (`EPERM` or filesystem doesn't support symlinks):

1. Recursively copy the source directory to the mirror path.
2. Prepend a banner to the mirror's `SKILL.md`:
   ```
   <!-- _generated: do not edit here. Source: .ai/skills/<name>/SKILL.md -->
   ```
   This banner is **not** prepended on symlink mirrors — only on copies — because on symlink mirrors the warning is false (edits do propagate).
3. Record the fallback in `.ai/context/.skills-state.json` (a kit-managed lockfile, gitignored by default — added to the generated `.gitignore` snippet in `init`).
4. `ai-context doctor` reports: "X skills are using copy-fallback mode (Windows). To upgrade, enable Developer Mode + `git config core.symlinks true` + re-run `ai-context build`."

Copy-fallback users lose the edit-downstream-propagates-upstream property, but the kit detects edits to copies during `build --check` and warns (a copy with a non-banner first line differs from its source → diagnose as "edited downstream, will be overwritten on next build").

## 5. Manifest schema additions

`.ai/context/manifest.json` gains an optional `skills` block:

```json
{
  "$schema": "./schemas/manifest.schema.json",
  "version": 1,
  "modulesDir": ".ai/context/modules",
  "scopesFile": ".ai/context/scopes.json",
  "targets": { "root": "AGENTS.md" },
  "claudeOutput": { "root": "CLAUDE.md" },
  "skills": {
    "source": ".ai/skills",
    "mirrors": [".agents/skills", ".claude/skills"],
    "metaSkill": true
  }
}
```

| Field | Type | Default | Purpose |
|---|---|---|---|
| `skills.source` | string (repo-relative path) | `.ai/skills` | Where source `<name>/` directories live |
| `skills.mirrors` | string[] (repo-relative paths) | `[".agents/skills", ".claude/skills"]` | Where mirror symlinks are created |
| `skills.metaSkill` | boolean | `true` | Whether the kit's `ai-context-kit` meta-skill is included in the source dir on `init` |

If `skills` is absent from the manifest, the kit operates in "skills-disabled" mode: `build` does not touch `.agents/skills/` or `.claude/skills/`, and `init` does not seed `.ai/skills/`. This preserves backward compatibility with 0.3.0 manifests.

When upgrading from 0.3.0, `ai-context doctor` detects the absence and prints: "Skills subsystem available. Run `ai-context init --upgrade` to enable." (See §10.)

## 6. CLI changes

The CLI gains skill management without proliferating commands:

| Command | Status | Behavior |
|---|---|---|
| `ai-context init` | extended | Writes the meta-skill into `.ai/skills/ai-context-kit/` and creates initial mirrors (when manifest has `skills` block). New `--upgrade` flag adds `skills` block to an existing 0.3.0 manifest and seeds the meta-skill, without touching `.ai/context/`. |
| `ai-context build` | extended | After existing module/scope generation, processes `.ai/skills/` and ensures all mirrors are correct. `--remove-orphans` removes mirrors whose source is gone. `--check` errors on mirror drift the same way it errors on AGENTS.md drift. |
| `ai-context doctor` | extended | Adds skill checks: invalid frontmatter, missing `SKILL.md`, broken symlinks, copy-fallback usage, scope-ID references to undefined scopes, mirror-vs-source conflicts. |
| `ai-context verify` | extended | Validates that mirrors exist and target the right source for every skill. Used in CI. |
| `ai-context lint-config` | extended | Validates `skills` manifest block + skill frontmatter spec compliance. |
| `ai-context diff` | extended | Shows skill mirror create/update/delete preview. |
| `ai-context skills create <name>` | **new** | Nested subcommand. Scaffold `.ai/skills/<name>/SKILL.md` with template. Flags: `--description="..."`, `--scope=<id>` (repeatable), `--with-references`, `--with-scripts`. Runs `build` afterward to create mirrors. |
| `ai-context skills list` | **new** | Nested subcommand. Print every skill with: name, description, scope(s), mirror status (symlink/copy-fallback/missing), source path. JSON output with `--json` for tooling. |

CLI naming convention: nested subcommands (`ai-context skills create`), not colon-separated (`skills:create`). Matches Commander.js idiomatic style and existing kit conventions (`lint-config`, not `lint:config`).

No `skills remove` or `skills rename` — users do this with `rm -rf .ai/skills/<name>` (or `mv`) followed by `ai-context build --remove-orphans`. Avoids redundant CLI surface.

No `skills migrate` (legacy bare-`.md` slash-command → skill directory). Out of scope for 1.0; EPMX has 2 legacy files (`worktree.md`, `worktree-cleanup.md`) which the user converts by hand or deletes.

## 7. The `ai-context-kit` meta-skill

Shipped at `packages/templates/src/skills/ai-context-kit/` and laid down by `ai-context init` (or `init --upgrade`). Lives at `.ai/skills/ai-context-kit/` in every kit-using repo.

### 7.1 Why ship it as a skill (not a CLAUDE.md stanza)

Skills are loaded on demand. CLAUDE.md content is always in context. The kit's authoring guidance is 5–10k tokens of writing-conventions, manifest schema, and scope-system explanation — too heavy for always-on context but exactly the right load when an agent is actually trying to add a module or scope.

Lean stanza in `AGENTS.md`/`CLAUDE.md` (always loaded) points at the skill (loaded on demand). See §8.

### 7.2 Meta-skill contents

This is the kit's own dogfood of the "rich skill" pattern:

```
.ai/skills/ai-context-kit/
├── SKILL.md                              ← overview, when-to-use, router
├── references/
│   ├── authoring-modules.md              ← detail on module front-matter, targets, ordering
│   ├── authoring-scopes.md               ← detail on scope IDs, includes vs codexIncludes, claudeIncludes, claudePaths
│   ├── authoring-skills.md               ← detail on SKILL.md frontmatter, scope:, references/, scripts/
│   ├── manifest-schema.md                ← manifest.json field-by-field
│   ├── cli-commands.md                   ← full command reference (auto-extracted in CI from cli/dist help text)
│   └── content-guide.md                  ← excerpt of docs/content-guide.md (single source via include or copy)
└── scripts/
    └── doctor.sh                         ← convenience: invokes `ai-context doctor` with kit-friendly defaults
```

`SKILL.md` is a router. Body:

```markdown
---
name: ai-context-kit
description: Use when authoring modules, scopes, or skills in this repo, when adding new agent context, when running `ai-context build/verify/doctor`, or when an agent needs to understand how this repo's AGENTS.md/CLAUDE.md are generated.
---

# ai-context-kit

This repo's AGENTS.md/CLAUDE.md and skills are generated by [ai-context-kit](https://github.com/TimCrooker/ai-context-kit). Edit sources under `.ai/`, never the generated files.

## Quickstart

- Authoring a context module: see `references/authoring-modules.md`
- Authoring a scope: see `references/authoring-scopes.md`
- Authoring a skill: see `references/authoring-skills.md`
- Manifest schema reference: see `references/manifest-schema.md`
- CLI commands: see `references/cli-commands.md`

## After any edit

Run `ai-context build` to regenerate outputs. Run `ai-context verify` in CI to catch drift.
```

### 7.3 When the meta-skill auto-loads

`description` frontmatter is keyword-rich for the common triggers: "context module", "scope", "skill", "AGENTS.md", "CLAUDE.md", "ai-context build". Agents see this in their startup skill list and load the body when relevant. Manual `/ai-context-kit` invocation also works.

### 7.4 Updating the meta-skill in a consumer repo

The meta-skill content can drift from the kit version that shipped it. `ai-context init --upgrade --refresh-meta-skill` (additive flag on the upgrade flow defined in §6) overwrites `.ai/skills/ai-context-kit/` from the current `@timothycrooker/ai-context-templates` package (preserving any consumer-added files under `.ai/skills/ai-context-kit/local/`, if present — convention, not enforced). This keeps the kit's own guidance evergreen.

Without `--refresh-meta-skill`, `init --upgrade` is idempotent — it adds the manifest `skills` block if absent and seeds the meta-skill if absent, but never overwrites existing skill content.

## 8. Context injection in generated `AGENTS.md` / `CLAUDE.md`

Today, generated files have a `<!-- GENERATED FILE -->` header and (for CLAUDE.md) a "Claude-Specific Notes" footer. The kit adds a lean **kit-awareness stanza** near the top:

```markdown
<!-- GENERATED FILE: Do not edit directly.
  Source: .ai/context/modules/*.md
  Build: ai-context build
-->

## Working in this repo

This repo's context and skills are managed by [ai-context-kit](https://github.com/TimCrooker/ai-context-kit). For authoring guidance, schema reference, or to add a new module/scope/skill, invoke the `/ai-context-kit` skill (or just ask about modules/scopes/skills — the skill auto-loads on those keywords).

Run `ai-context build` after editing anything under `.ai/`. Generated files are: AGENTS.md, CLAUDE.md, .claude/rules/*.md, .agents/skills/*, .claude/skills/*.

---

<existing module content follows>
```

~6 lines. Minimal token cost. Points at the meta-skill for depth. Identical wording in AGENTS.md and CLAUDE.md (the agentskills.io tools see AGENTS.md, Claude sees CLAUDE.md). Scoped per-package AGENTS.md/CLAUDE.md files get a shorter variant ("...managed by ai-context-kit, see root for details.").

This stanza is emitted by `render.ts` (existing module) when `manifest.skills` is present. When `skills` is absent (legacy mode), the stanza isn't emitted — preserving 0.3.0 output exactly.

## 9. Backward compatibility

| Existing behavior | Status in 1.0 |
|---|---|
| Manifest without `skills` field | Operates as 0.3.0 — no skill processing, no kit-awareness stanza emitted |
| `claudeOutput` field | Unchanged. If absent, no CLAUDE.md generated (skills still work; Claude Code reads `.claude/skills/` regardless of CLAUDE.md presence) |
| `.claude/rules/*.md` generation | Unchanged. Path-glob rules are independent of skills |
| `scopes.json` parity flag | Unchanged |
| `ai-context build --check` exit codes | Unchanged for legacy paths; gains code `CTX_E_SKILL_MIRROR_DRIFT` for new skill paths |
| Existing `ContextError` codes | Preserved verbatim. New codes added in `engine.ts` follow the existing `CTX_E_*` naming |
| Standard and monorepo templates | Both extended with `.ai/skills/` + meta-skill seed. Existing files unchanged |

A 0.3.0 → 1.0.0 upgrade path:
1. `pnpm up @timothycrooker/ai-context-cli@1.0.0`
2. `ai-context doctor` — reports skills available
3. `ai-context init --upgrade` — adds `skills` block to manifest, seeds meta-skill, creates initial mirrors
4. `ai-context build` — regenerates AGENTS.md/CLAUDE.md with kit-awareness stanza

The user opts in. No breakage on `pnpm up` alone.

## 10. Validation harness

A new `examples/gauntlet/` exercises every skill shape against every supported CLI. Manual-run via `pnpm gauntlet` (not in CI — CLIs need auth not present on GitHub runners).

### 10.1 Fixture project

`examples/gauntlet/` is a scaffolded kit-using repo with:

- A monorepo manifest with two scopes (`api`, `web`)
- One skill of each shape:
  - `.ai/skills/plain-skill/SKILL.md` — bare SKILL.md only
  - `.ai/skills/skill-with-refs/{SKILL.md, references/notes.md}`
  - `.ai/skills/skill-with-scripts/{SKILL.md, scripts/probe.sh}`
  - `.ai/skills/api-scoped-skill/SKILL.md` — frontmatter `scope: [api]`
  - `.ai/skills/router-skill/SKILL.md` — frontmatter references sibling skills in body
- The kit's meta-skill (auto-installed by `ai-context init`)
- A sample `AGENTS.md` + `CLAUDE.md` regenerated from `.ai/context/`

### 10.2 Gauntlet stages

`scripts/gauntlet/run.sh` runs in sequence:

1. **Emission test (no CLI needed).** Run `ai-context build` in the fixture. Assert all symlinks present and pointing correctly. Assert references/ and scripts/ accessible through mirror paths. Assert scoped skill appears at `apps/api/.agents/skills/` and `apps/api/.claude/skills/` but not at `apps/web/...`. Assert kit-awareness stanza present in root AGENTS.md and CLAUDE.md.
2. **Edit propagation test.** Edit `.claude/skills/plain-skill/SKILL.md`. Assert `.ai/skills/plain-skill/SKILL.md` reflects the edit (shared inode). Assert `.agents/skills/plain-skill/SKILL.md` reflects it too.
3. **Claude Code discovery.** `claude -p "List all skills available, with their descriptions"` (headless). Assert response contains: `plain-skill`, `skill-with-refs`, `skill-with-scripts`, `router-skill`, `ai-context-kit`. Assert `api-scoped-skill` is absent when invoked from repo root, present when invoked from `apps/api/`.
4. **Codex discovery.** `codex exec "List all skills available"` (the exact headless invocation surface for Codex CLI is the first thing the implementation plan must pin down — Codex's `exec` subcommand exists per its docs but its skill-listing output format is the variable). Same assertions.
5. **Gemini discovery.** `gemini -p "List all skills available"` (and verify `activate_skill` lifecycle). Same assertions.
6. **Reference loading.** For each CLI: prompt that triggers `skill-with-refs`, then ask about content of `references/notes.md`. Assert response references the file content.
7. **Script execution.** For each CLI: prompt that triggers `skill-with-scripts`, then ask it to run the bundled `probe.sh`. Assert successful execution.
8. **Meta-skill discovery.** For each CLI: prompt "How do I add a new context module to this repo?". Assert the `ai-context-kit` skill is invoked (auto or named) and the response cites `references/authoring-modules.md`.
9. **Windows-fallback emission test.** Set env `AI_CONTEXT_FORCE_COPY_FALLBACK=1`, regenerate, assert mirrors are copies (not symlinks) with the `_generated:` banner.

### 10.3 Gauntlet output

`scripts/gauntlet/run.sh` writes a markdown report to `examples/gauntlet/results/<timestamp>.md` with per-stage pass/fail, CLI versions tested, and full CLI transcripts for failed stages. Committed to git as part of this release as evidence of empirical validation.

### 10.4 Not in scope for the gauntlet

- Multi-OS matrix. Run on macOS only for v1.0. Windows fallback tested via the forced-copy env var, not via real Windows execution.
- Performance/scale (gauntlet runs in seconds, not load-test).
- Other CLIs on the agents.md compatibility list (Cursor, Goose, Aider, OpenCode, etc.) — they read `.agents/skills/` natively per spec, so symlink emission is sufficient. We don't headlessly invoke them in v1.0.

## 11. Release plan

Single major bump across all four packages to **1.0.0**:

1. **Changeset** added on the feature branch: `major` change for all four packages, summary "Skills authoring + cross-CLI context injection."
2. Merge feature branch to `main` via PR.
3. Existing GitHub Actions release workflow opens a "Version Packages" PR via `changesets/action`. Tim approves + merges.
4. `pnpm release` (changeset publish) → npm publishes `@timothycrooker/ai-context-{core,cli,templates,config}@1.0.0` with provenance.
5. Post-publish: `release-preflight.mjs` runs `npm view` poll (existing flow, 12×10s retries) to confirm visibility.
6. Tag the release `v1.0.0` on `main`.
7. GitHub release notes generated from changeset + a short hand-written "Highlights" section pointing at the meta-skill, `.agents/skills/` adoption, and the gauntlet.

Why 1.0.0 not 0.4.0:
- This is the kit's feature-completion milestone — modules + scopes + skills + meta-skill + cross-CLI all present.
- `init --upgrade` is a new flow consumer repos opt into (not breakage), but the kit explicitly commits to stability of the manifest schema + symlink layout from 1.0 onward.
- Matches the public versioning policy in `docs/support-policy.md` (need to update that file to extend the policy through 1.x).

## 12. Out of scope

Explicitly **not** in this release:

- **EPMX migration.** Build the kit first, validate via fixture-gauntlet, then migrate EPMX as a separate effort (likely a follow-on PR in the EPMX repo, possibly automated via `ai-context init --upgrade` + per-skill audit). The kit must work on a green fixture before touching production usage.
- **Slash-command migration tool** (legacy `worktree.md` → `worktree/SKILL.md`). EPMX has 2 such files; convert by hand.
- **GEMINI.md generation.** Gemini reads AGENTS.md per the agents.md spec. No separate generation needed.
- **Real CI gauntlet.** v1.0 ships with manual-run gauntlet only. Future work: design a CI surface using mock CLIs or paid runners with credentials.
- **Cursor / Goose / Aider / OpenCode discovery tests.** They read `.agents/skills/` natively; same symlink as Codex. Adding headless invocation per CLI is future work.
- **Windows test runner.** Force-copy-fallback env var tests the code path; real Windows validation is future work.
- **Skill versioning / dependency declarations.** Skills are flat units; future spec may add `metadata.version` or `metadata.requires`, but not in 1.0.
- **`skills:remove` / `skills:rename` CLI subcommands.** Use `rm`/`mv` + `ai-context build --remove-orphans`.

## 13. Risks & open questions

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Symlinks fail on consumer repos (Windows, weird filesystems, zip-distributed checkouts) | Medium for Windows, low for everything else | Skills don't show up in CLIs | Copy-fallback (§4.5) with loud `doctor` warnings |
| Gauntlet CLI invocations require auth that varies per CLI | High | Gauntlet can't run unattended | Document each CLI's required env vars in `scripts/gauntlet/README.md`. Skip CLIs with missing auth; report skip in results. |
| Claude `.claude/skills/` walks symlinks but doesn't note this in docs | Low | Discovery fails for symlinked skills | Verified in §4 fixture experiment (this design doc was preceded by an on-disk test). Adding a stage-1 emission test to gauntlet that runs `claude -p` against a fixture explicitly confirms it. |
| Codex skill discovery format changes (still pre-1.0 in their CLI) | Medium | Gauntlet stage 4 starts failing | Pin Codex CLI version in gauntlet README. Skills source format follows agentskills.io spec which is upstream of CLI changes. |
| `.ai/skills/ai-context-kit/` collides with a consumer-authored skill named `ai-context-kit` | Very low (name is namespaced enough) | `init --upgrade` would overwrite consumer's skill | `init --upgrade` errors if `.ai/skills/ai-context-kit/` exists and content has diverged from kit's shipped meta-skill. Override with `--force`. |
| Manifest schema gains `skills` field but consumer's schema validator is pinned to v0.3.0 schema | Low | Validator errors on the new field | The schema version stays at `version: 1` and the `skills` field is `additionalProperties` (already permitted by the existing schema). No breaking validator change. Add `skills` to the schema file in this release. |

**Open questions** (need answers before implementation, but the design accommodates either way):

1. Should the kit-awareness stanza in AGENTS.md/CLAUDE.md be a separate, named module (so consumers can disable it via scope filtering) or hardcoded in `render.ts`? Lean: hardcoded for simplicity, since it's <10 lines and tightly coupled to the kit's own surface.
2. Should `init --upgrade --refresh-meta-skill` be the default behavior on `pnpm up` of the templates package, or always explicit? Lean: always explicit (no implicit overwrites of repo content during dependency upgrades).
3. Is `manifest.skills.metaSkill: false` worth supporting (consumers who want skill machinery but don't want the kit's meta-skill)? Lean: yes, trivial to support and respects user agency.

---

## Appendix A — file inventory of the change

New files in `ai-context-kit/`:
- `packages/core/src/skills.ts` — new module: skill discovery, mirror creation, frontmatter validation, scope resolution
- `packages/core/test/skills.test.ts` — unit tests
- `packages/templates/src/skills/ai-context-kit/SKILL.md` — meta-skill body
- `packages/templates/src/skills/ai-context-kit/references/*.md` — meta-skill references (~5 files)
- `packages/templates/src/skills/ai-context-kit/scripts/doctor.sh`
- `packages/cli/src/commands/skills/create.ts` — `ai-context skills create` subcommand handler
- `packages/cli/src/commands/skills/list.ts` — `ai-context skills list` subcommand handler
- `packages/cli/src/commands/skills/index.ts` — registers the `skills` command group on the root program
- `packages/cli/test/skills.test.ts`
- `examples/gauntlet/` — entire fixture + result reports
- `scripts/gauntlet/run.sh` — gauntlet driver
- `scripts/gauntlet/README.md` — auth + CLI version notes
- `docs/skills-guide.md` — public-facing skill authoring guide (consumer-targeted, distinct from in-repo meta-skill references)
- `.changeset/skills-and-context-injection.md` — release changeset

Modified files:
- `packages/core/src/types.ts` — add `SkillDefinition`, `SkillFrontmatter`, manifest `skills` field
- `packages/core/src/config.ts` — load + validate manifest `skills` block
- `packages/core/src/engine.ts` — wire skill processing into `buildInternal`, `verifyAll`, `diffGenerated`, `doctor`, `lintConfig`
- `packages/core/src/render.ts` — emit kit-awareness stanza in `buildRootAgents` + `buildClaudeRoot` when `manifest.skills` present
- `packages/core/src/errors.ts` — new `CTX_E_SKILL_*` codes
- `packages/cli/src/index.ts` — register the `skills` command group; extend `init` with `--upgrade` and `--refresh-meta-skill`
- `packages/templates/src/{standard,monorepo}.ts` — add `.ai/skills/` directory + meta-skill files
- `packages/templates/src/index.ts` — bundle skill files in template payloads
- `.ai/context/schemas/manifest.schema.json` — add `skills` field
- `docs/cli-contract.md` — document new subcommands + flag additions
- `docs/configuration.md` — document `skills` manifest block
- `docs/error-codes.md` — document new error codes
- `docs/support-policy.md` — extend policy through 1.x

## Appendix B — agentskills.io spec compliance

The kit's `SKILL.md` validation enforces:
- `name` (required): 1–64 chars, `[a-z0-9-]`, no leading/trailing/consecutive hyphens, must match directory name
- `description` (required, recommended ≥1 char ≤1024 chars): the agentskills.io baseline
- Optional fields: `license`, `compatibility`, `metadata` (any shape), `allowed-tools` (experimental)
- Claude-specific extensions (`when_to_use`, `disable-model-invocation`, etc.) accepted at top level (per Claude's docs) but the kit doesn't validate them — they're passed through

The kit may at any time switch to the upstream reference validator at https://github.com/agentskills/agentskills (`skills-ref validate ./my-skill`) if/when the project publishes a node-importable validator. Currently the kit ships its own minimal validator to avoid a moving-target dependency.

## Appendix C — relationship to other agent tooling

| System | What it does | How ai-context-kit relates |
|---|---|---|
| agentskills.io | Open standard for skill file format | The kit conforms; validates against the spec |
| Claude Code plugins | Marketplace-distributed skill bundles | Out of scope. Future: emit a `.claude-plugin/` manifest from a kit-using repo so it can publish as a plugin. |
| Codex `.codex-plugin/` | Codex marketplace bundles | Same as above. Future: emit `.codex-plugin/plugin.json` for distribution. |
| Gemini extensions (`gemini-extension.json`) | Gemini's auto-load mechanism | Not needed — Gemini reads `.agents/skills/` natively per spec. |
| Cursor / Goose / Aider / OpenCode | Various agent CLIs on agents.md compat list | All read `.agents/skills/` natively. The kit's emission is sufficient; no per-CLI manifest needed. |
| Superpowers (claude-plugins-official) | Skill distribution pattern for Claude Code | Reference for skill body conventions (long descriptions, references/, scripts/). The kit's meta-skill follows this style. |
