# ai-context-kit 1.1: `migrate` CLI + `ai-context-migrate` skill

**Status:** Draft for review
**Date:** 2026-05-26
**Owner:** Tim Crooker
**Target release:** `@timothycrooker/ai-context-{core,cli,templates,config}@1.1.0`
**Depends on:** v1.0.0 (skills subsystem + meta-skill, PR #3)

---

## 1. Summary

ai-context-kit 1.1 adds a **migration capability** that takes an existing repo with skills scattered across legacy locations (`.claude/skills/<name>/` directories, bare-MD slash commands, hand-symlinked entries) and produces a clean kit-managed layout under `.ai/skills/` with proper cross-CLI symlink mirrors.

Two deliverables:
- **`ai-context migrate` CLI command** — mechanical, safe, idempotent. Generates a deterministic migration plan, applies it under git-clean preconditions, makes one git commit per logical action for clean rollback.
- **`ai-context-migrate` skill** — bundled with the kit, invoked by an agent for the optional Phase 2 curation step (overlap detection, family-router consolidation, legacy bare-MD promotion judgment).

EPMX Monorepo is the validating consumer: 40 existing entries in `.claude/skills/` (31 directories, 6 hand-symlinks, 2 bare-MD slash commands, 1 README.md) get migrated to a 39-skill `.ai/skills/` layout with all three CLIs (Claude/Codex/Gemini) able to discover every skill.

## 2. Motivation

After v1.0.0 ships, the skill subsystem works for fresh repos using `ai-context init`. But existing repos that already organically grew a `.claude/skills/` tree need a migration path. Doing this by hand is risky:

- 40 skills × 3-4 path changes per skill (move source, set up two symlinks, possibly update internal references) = high error rate
- Loss of git history if files are deleted-and-recreated instead of `git mv`'d
- No way to validate completeness without running the gauntlet, which itself requires the migration to be done first

A first-class `migrate` capability removes this friction. Bonus: any future repo adopting ai-context-kit gets the same migration path for free.

## 3. The 4-phase migration model

Each phase has clear inputs and outputs. Phases 1, 3, 4 are deterministic and CLI-driven. Phase 2 is agent-driven and optional.

| Phase | Tool | Effect | Safety |
|---|---|---|---|
| **1. Audit** | `ai-context migrate --plan` | Scan existing layout, write `.ai/migration-plan.json` | Read-only |
| **2. Curate** *(optional)* | `ai-context-migrate` skill (agent) | Read plan, examine content, identify overlap, edit plan with merge/drop/factor decisions | Plan-file edits only |
| **3. Apply** | `ai-context migrate --apply` | Execute plan entries; each is one git commit | Requires clean git tree + manifest has `skills` block |
| **4. Verify** | `ai-context build && verify && doctor` + gauntlet | Confirms migrated layout is healthy and cross-CLI discoverable | Read-only checks |

The separation ensures: planning never writes to disk; curation is plan-edits only; apply is gated; verification confirms.

## 4. Architecture

### 4.1 Plan generation (Phase 1)

`ai-context migrate --plan` runs the following pipeline:

1. **Discover legacy state.** Walk `.claude/skills/`, `.agents/skills/`, and `.ai/skills/` (if exists). For each entry, classify:
   - `directory_with_skill_md` — `<dir>/SKILL.md` exists, no kit symlink yet
   - `bare_md` — `<name>.md` directly in `.claude/skills/` (legacy slash command)
   - `existing_symlink` — `<path>` is a symlink, target is `.agents/skills/<name>` or `.ai/skills/<name>`
   - `already_kit_managed` — source already at `.ai/skills/<name>/` with proper symlinks
   - `non_skill_file` — looks like docs or a config (e.g., `README.md`)

2. **Compute target action per entry.** For each classified entry, derive the migration action:

   | Current state | Action | Target |
   |---|---|---|
   | `directory_with_skill_md` at `.claude/skills/<name>/` | `move_dir` | `.ai/skills/<name>/`, symlinks at `.agents/skills/<name>` + `.claude/skills/<name>` |
   | `bare_md` at `.claude/skills/<name>.md` | `promote_bare_md` | `.ai/skills/<name>/SKILL.md`, symlinks at both mirrors; original bare-MD removed |
   | `existing_symlink` at `.claude/skills/<name>` → `.agents/skills/<name>` (real dir) | `consolidate_symlink` | `.ai/skills/<name>/` (move from `.agents/skills/`), new symlinks at both mirrors |
   | `already_kit_managed` | `keep_existing` | no-op |
   | `non_skill_file` (e.g. README.md) | `keep_existing` | no-op |
   | Unclear/ambiguous | `REVIEW` | flagged for Phase 2 curation |

3. **Detect overlap candidates.** Without doing content analysis (that's Phase 2's job), the CLI flags structural overlap signals:
   - Same skill name appears as both bare-MD AND directory form
   - Multiple files with the same `name:` frontmatter value
   - Existing symlinks where target doesn't match expected `.agents/skills/<name>` pattern

   These are added to the plan's `review_candidates` array, NOT to the main entries. The skill handles them.

4. **Write plan.** Serialize to `.ai/migration-plan.json`. Pretty-printed for human/agent review.

### 4.2 Plan file format

```json
{
  "version": 1,
  "generated_at": "2026-05-26T12:00:00Z",
  "generator": {
    "kit_version": "1.1.0",
    "cwd": "/Users/timcrooker/EPMX-Monorepo"
  },
  "summary": {
    "total_entries_found": 40,
    "actions": {
      "move_dir": 31,
      "promote_bare_md": 2,
      "consolidate_symlink": 6,
      "keep_existing": 1
    },
    "review_candidates": 0,
    "applied": false
  },
  "entries": [
    {
      "name": "encompass-api",
      "current_state": {
        "type": "directory_with_skill_md",
        "path": ".claude/skills/encompass-api/",
        "files": ["SKILL.md"]
      },
      "action": "move_dir",
      "target": {
        "source": ".ai/skills/encompass-api/",
        "mirrors": [".agents/skills/encompass-api", ".claude/skills/encompass-api"]
      },
      "rationale": "Standard directory skill with SKILL.md; move source to .ai/skills/ and create both mirror symlinks.",
      "applied_at": null
    },
    {
      "name": "worktree",
      "current_state": {
        "type": "bare_md",
        "path": ".claude/skills/worktree.md"
      },
      "action": "promote_bare_md",
      "target": {
        "source": ".ai/skills/worktree/SKILL.md",
        "mirrors": [".agents/skills/worktree", ".claude/skills/worktree"]
      },
      "rationale": "Legacy slash-command form; promote to skill directory with SKILL.md. Content preserved verbatim.",
      "applied_at": null
    },
    {
      "name": "adversarial-ui-review",
      "current_state": {
        "type": "existing_symlink",
        "path": ".claude/skills/adversarial-ui-review",
        "current_target": "../../.agents/skills/adversarial-ui-review",
        "underlying_source": ".agents/skills/adversarial-ui-review/"
      },
      "action": "consolidate_symlink",
      "target": {
        "source": ".ai/skills/adversarial-ui-review/",
        "mirrors": [".agents/skills/adversarial-ui-review", ".claude/skills/adversarial-ui-review"]
      },
      "rationale": "Existing hand-symlink with source at .agents/skills/. Move source to .ai/skills/, repoint both mirrors. Preserves edit history.",
      "applied_at": null
    }
  ],
  "review_candidates": []
}
```

The `applied_at` field on each entry tracks per-entry idempotency: `--apply` skips entries that already have a timestamp.

### 4.3 Apply mechanics (Phase 3)

`ai-context migrate --apply` reads the plan, then for each entry where `applied_at` is null:

1. **Verify preconditions** (once at start):
   - `.ai/context/manifest.json` exists with a `skills` block (run `ai-context init --upgrade` first if not)
   - Git working tree is clean (`git diff --quiet && git diff --cached --quiet`)
   - Plan file exists and is valid v1 JSON
   - No entries reference paths outside the repo root

2. **For each entry** (in plan order):
   - Execute the action via `git mv` where possible (preserves history), `mkdir -p` + `git add` + symlink commands otherwise
   - `move_dir`: `git mv .claude/skills/<name> .ai/skills/<name>`, then create symlinks at the two mirror paths
   - `promote_bare_md`: `mkdir -p .ai/skills/<name>`, `git mv .claude/skills/<name>.md .ai/skills/<name>/SKILL.md`, create symlinks
   - `consolidate_symlink`: `git mv .agents/skills/<name> .ai/skills/<name>`, remove the old `.claude/skills/<name>` symlink, create new symlinks at both mirror paths
   - `keep_existing`: no-op
   - Make one git commit per entry: `chore(migrate): <action> <name>` with a body summarizing the rationale from the plan
   - Update the plan's entry with `applied_at` timestamp + write back to disk

3. **Final step**: run `ai-context build` to ensure mirror state is consistent; verify with `ai-context verify`. If verify fails, report the failure but DON'T auto-roll-back — the user investigates.

The per-entry commit pattern means: if something goes wrong mid-migration, the user can `git reset --hard HEAD~N` to unwind exactly N entries.

### 4.4 The `ai-context-migrate` skill (Phase 2)

Lives at `packages/templates/src/skills/ai-context-migrate/`. Installed automatically by `ai-context init` (alongside the existing `ai-context-kit` meta-skill) when the kit is version 1.1+.

**Trigger:** description-based auto-load when an agent sees phrases like "migrate to ai-context-kit," "convert .claude/skills/ to the new layout," or when the agent encounters a `.ai/migration-plan.json` file in the repo. Also user-invocable via `/ai-context-migrate`.

**SKILL.md** body:

```markdown
---
name: ai-context-migrate
description: Use when migrating an existing repo to ai-context-kit's skill subsystem; when `.ai/migration-plan.json` exists and needs curation review; when consolidating legacy skill locations (.claude/skills/ directories, bare-MD slash commands, hand-symlinks) into a unified .ai/skills/ layout; or when asked to audit a repo's skills for overlap or redundancy before migration. Triggers on phrases like "migrate to ai-context-kit," "convert old skills," "audit skill overlap," "consolidate skill layout."
---

# ai-context-migrate

Drive the curation phase of a multi-step migration to ai-context-kit's skill subsystem.

## When to invoke

- A repo has skills in legacy locations (`.claude/skills/`) and wants to migrate to `.ai/skills/`
- A `.ai/migration-plan.json` file exists and is unapplied
- The user explicitly invokes `/ai-context-migrate`

## The 4-phase workflow you're in

1. **Audit** — already done before you. The CLI generated `.ai/migration-plan.json`.
2. **Curate (YOUR PHASE)** — examine the plan + actual skill content, identify overlap, edit the plan with merge/drop decisions.
3. **Apply** — after your curation, the user (or you) runs `ai-context migrate --apply` to execute.
4. **Verify** — `ai-context build && verify && doctor` confirms healthy state.

## Your job in Phase 2

1. Read `.ai/migration-plan.json`. Confirm it exists, is unapplied, and has reasonable summary counts.
2. For each `review_candidate`: examine the underlying source files, decide what to do (see `references/overlap-detection.md`).
3. For each main entry: spot-check whether the auto-classification is correct (e.g., is a `keep_existing` entry actually a real skill being missed?).
4. If you find clusters of overlap NOT flagged by the CLI: cross-reference the family-router pattern in `references/family-routing.md` and decide whether to factor common content into shared references/ files.
5. Edit the plan: change actions, add `REVIEW` resolutions, add new entries for content abstraction.
6. Tell the user what you decided and why. Do NOT auto-run `--apply` — that's their decision.

## What you don't do

- Don't apply the plan. That's Phase 3, gated by the user.
- Don't move files around manually. The plan is the artifact; --apply executes.
- Don't dedupe aggressively without rationale. If two skills look similar but serve distinct purposes (e.g., router + specialty), keep both.

## See also

- `references/overlap-detection.md` — heuristics for finding redundancy
- `references/family-routing.md` — router-skill consolidation rules
- `references/legacy-md-conversion.md` — promoting bare-MD slash commands
- `references/post-migration-verification.md` — checklist for Phase 4
```

**`references/overlap-detection.md`** documents specific heuristics:
- Identical `description:` frontmatter values across skills → likely duplicate, examine closely
- Bare-MD + directory form with the same root name → the directory form usually wins; bare-MD is preserved as a slash-command shortcut only if explicitly intended
- Multiple skills sharing 60%+ of their section headers → strong overlap; consider factoring shared sections into a sibling `references/` doc
- Skills referenced from another skill's body that don't exist on disk → broken router pattern; either create the missing target or fix the reference

**`references/family-routing.md`** documents when router skills are intentional:
- Router skill exists when one entry-point skill (e.g., `roam-api`) names sibling specialty skills (`roam-auth`, `roam-chat`, etc.) and tells the agent which to invoke for which task
- Don't collapse router + specialties into one skill — the lazy-load pattern (router is always-in-context, specialties load on demand) is the value
- DO factor strictly-shared text into a family-wide `references/` file IF the sharing is high (>30% of each specialty's body)

**`references/legacy-md-conversion.md`** documents bare-MD promotion:
- A bare `.claude/skills/<name>.md` becomes `.ai/skills/<name>/SKILL.md` directory form
- Verify the frontmatter has a `name:` field matching `<name>` — if absent, add it
- Preserve the body content verbatim
- If the bare-MD was being used purely as a slash-command shortcut (no auto-load), no special handling needed — directory form auto-loads same way

**`references/post-migration-verification.md`** is a checklist:
- `ai-context verify` exits 0
- `ai-context doctor` reports no issues
- `ai-context skills list` shows every migrated skill with mirror state `symlink`
- For each CLI (Claude/Codex/Gemini): headless invocation lists every skill
- For at least one skill with `references/`: an agent successfully reads it
- For at least one skill with `scripts/`: an agent successfully executes it

### 4.5 CLI surface

```bash
ai-context migrate --plan [--output <path>]    # Generate migration plan
ai-context migrate --status                    # Show plan presence + applied state
ai-context migrate --apply [--dry-run]         # Execute the plan
ai-context migrate --clean                     # Remove plan file (typically after successful apply)
```

| Subcommand flag | Behavior | Exit codes |
|---|---|---|
| `--plan` | Generate `.ai/migration-plan.json`. Errors if plan file already exists (use `--force` to overwrite). | 0 success / 1 plan-already-exists / 2 unexpected layout |
| `--plan --force` | Overwrite existing plan. | 0 success |
| `--status` | Print one-line summary of plan state: not present / present unapplied / partially applied (N of M) / fully applied | 0 always |
| `--apply` | Execute plan entries in order. Skips entries where `applied_at` is set. | 0 success / 1 precondition failed / 2 entry execution failed |
| `--apply --dry-run` | Same as `--apply` but no disk writes; reports what would happen. | 0 / 2 |
| `--clean` | Delete `.ai/migration-plan.json`. Refuses unless `summary.applied: true`. | 0 / 1 not-applied |

### 4.6 Manifest interaction

`ai-context migrate` requires `manifest.skills` to be configured. If the manifest doesn't have a `skills` block:

- `--plan` runs anyway — it generates a plan, but adds a top-level `warnings` array noting that the manifest needs upgrading
- `--apply` refuses with `AICTX_MIGRATE_NO_SKILLS_BLOCK` error and instructs: "Run `ai-context init --upgrade` first to enable the skills subsystem in your manifest."

This ordering means: a user who runs `ai-context migrate --apply` on a stale-manifest repo gets a clear error pointing at the prerequisite, rather than silent failure.

## 5. EPMX-specific application

For EPMX Monorepo (`/Users/timcrooker/EPMX-Monorepo`), the expected plan after `ai-context migrate --plan`:

| Action | Count | Examples |
|---|---|---|
| `move_dir` | 31 | encompass-api, encompass-auth, encompass-probing, encompass-safe-writes, encompass-schema, roam-api, roam-auth, roam-chat, roam-meetings, roam-mcp, roam-on-the-map, roam-probing, roam-webhooks, graph-api, graph-auth, graph-calendar, graph-files, graph-mail, graph-probing, graph-safe-writes, graph-schema, graph-teams, graph-webhooks, atlassian-api, atlassian-auth, atlassian-jira-read, atlassian-jira-write, atlassian-mcp-gotchas, max-as-consultant, backlog-triage, api-probing-methodology |
| `promote_bare_md` | 2 | worktree.md, worktree-cleanup.md |
| `consolidate_symlink` | 6 | adversarial-ui-review, ai-sdk, pr-kickoff, pr-polish, introspection-driven-agent-refinement, release-scope-risk-assessment |
| `keep_existing` | 1 | `.claude/skills/README.md` |

**Total: 40 entries → 39 skills + 1 untouched README.**

Post-migration state:
- `.ai/skills/` contains 39 skill directories (each with SKILL.md + whatever subdirs the existing source has)
- `.agents/skills/` contains 39 symlinks
- `.claude/skills/` contains 39 symlinks + README.md
- Existing `.agents/skills/` real directories (the 6 hand-symlinked ones) get moved into `.ai/skills/`, leaving only symlinks in `.agents/skills/`

**Curation phase expectations:** EPMX's domain skills look well-curated. The `ai-context-migrate` skill likely finds nothing major to dedupe. Some optional refactors it might propose:
- Factor the family-router preamble shared across `roam-api` / `encompass-api` / `graph-api` / `atlassian-api` into a sibling `references/family-router-pattern.md` — but ONLY if the shared content is high. Likely won't pay off.
- Spot-check that `api-probing-methodology` doesn't redundantly explain things already covered in per-family probing skills (`encompass-probing` etc.). If yes, point per-family probing skills at the methodology skill via reference link.

These are judgment calls the skill surfaces; the human makes the call.

## 6. Validation

After applying the migration to EPMX:

### 6.1 Local verification

```bash
cd /Users/timcrooker/EPMX-Monorepo
ai-context build
ai-context verify           # must exit 0
ai-context doctor           # must report no issues
ai-context skills list      # confirms all 39 skills with mirror state 'symlink'
```

### 6.2 EPMX-adapted gauntlet

A new `scripts/epmx-gauntlet/run.sh` in the kit repo (mirroring the existing `scripts/gauntlet/run.sh` shape but pointing at EPMX):

- Stage 1: emission test — all 39 expected mirror paths exist
- Stage 2: edit propagation — edit a sample skill's SKILL.md via `.claude/skills/` path, confirm `.ai/skills/` source updates
- Stages 4-6: per-CLI discovery — Claude, Codex, Gemini each list a representative subset of skills (e.g., 5 randomly picked) and identify them correctly
- Stage 7: meta-skill awareness — Claude cites the ai-context-kit meta-skill when asked about EPMX skill authoring

This gauntlet is committed in the kit repo for future reuse. EPMX-specific. Run once during the migration, results committed for evidence.

### 6.3 Acceptance criteria

The migration is considered successful when:
1. EPMX's `.ai/skills/` contains 39 directories
2. Both mirror paths have 39 symlinks (verified by `ai-context doctor`)
3. EPMX's existing CLAUDE.md / AGENTS.md files now contain the kit-awareness stanza (regenerated by `ai-context build`)
4. EPMX gauntlet passes all stages
5. Git log shows ~40 atomic migration commits, all reversible
6. No skill content is altered during apply (verified by `git log -p` showing only path changes for move_dir actions)

## 7. Backward compatibility

Migrating is purely additive to the kit:
- `ai-context migrate` is a new subcommand; existing subcommands (`init`, `build`, `verify`, etc.) unchanged
- The migration plan format is v1; future versions can add fields without breaking
- Repos that don't migrate continue to work — the kit's existing 1.0 behavior is fully preserved

For EPMX specifically:
- The migration is non-destructive (`git mv` preserves history)
- Each entry is one git commit, so partial migration is supportable
- Existing skill content is preserved byte-for-byte during move
- The `ai-context-kit` meta-skill (already present in EPMX after running `ai-context init --upgrade` per v1.0) co-exists with the new `ai-context-migrate` skill

## 8. Release plan

Single minor bump (1.0.x → 1.1.0) for all four packages.

**Sequencing:**
1. **Prereq:** kit v1.0.0 ships (PR #3 merges, version-packages PR merges, npm publishes).
2. **This work:** branch `feat/migrate-cli-and-skill` (already created, off v1.0.0-feature HEAD).
   - Implement `ai-context migrate --plan` first; test on the gauntlet fixture
   - Add migration skill content
   - Implement `--apply` next; test on gauntlet fixture
   - Add EPMX-adapted gauntlet runner
3. **Validate against EPMX (the dogfooding cycle):**
   - On a branch in the EPMX repo, run `ai-context migrate --plan`
   - Review the generated plan; have the agent run the curation skill
   - Run `--apply`
   - Run EPMX gauntlet; confirm 39/39 skills discoverable across all CLIs
   - If anything is off: iterate on the kit code, re-run
4. **Ship 1.1.0:** changeset, PR, merge, version-packages PR, publish.
5. **Land EPMX migration:** separate PR on the EPMX repo, lands after kit 1.1.0 publishes to npm.

## 9. Out of scope

- **Migrating from non-ai-context-kit context systems** (e.g., other agent frameworks). The migrator only handles the kit's expected legacy locations.
- **Migrating `.claude/rules/*.md`** content. Rules are unchanged by this work.
- **Automated dedup decisions.** The skill surfaces candidates; the human or agent decides. No automated merging.
- **Cross-repo skill imports.** If EPMX has a skill that another repo wants to share, that's a separate "skill registry / publish" concern, not migration.
- **Rolling back a migrated repo to legacy layout.** Use `git reset --hard <commit-before-migration>` if needed. We don't ship a `migrate --revert`.

## 10. Risks & open questions

| Risk | Likelihood | Mitigation |
|---|---|---|
| EPMX's `git mv` operations on hand-symlinked skills create unexpected diffs | Medium | The `consolidate_symlink` action is the trickiest; pilot it carefully in `--dry-run` mode first |
| EPMX has skill content with cross-references (e.g., `roam-api` mentions `roam-auth` by path) — these may break after the move | Medium | The migration skill scans skill bodies for `<repo-root>/.claude/skills/<name>` patterns and warns. Fixes are manual but identified |
| Symlink targets diverge between mirror paths during `--apply` if interrupted mid-operation | Low | Per-entry git commit means a hard reset cleanly unwinds |
| The 6 currently-hand-symlinked skills have their source at `.agents/skills/<name>/` — moving the source breaks any consumer that hard-coded that path | Low (EPMX doesn't have such consumers AFAIK) | Document in commit message; skill body can be path-checked manually |

**Open questions** (need answers during implementation, but design works either way):

1. Should `--apply` automatically run `ai-context build` at the end, or report success and leave that to the user? Lean: yes, run build automatically since the migration is incomplete without mirrors. But require a clean build exit code.
2. Should the migration skill require explicit invocation, or auto-load when `.ai/migration-plan.json` exists? Lean: auto-load — the file's presence is a strong trigger signal.
3. Should the gauntlet adaptation for EPMX assume specific skill names exist (e.g., test `encompass-api` discovery), or sample randomly? Lean: assume a SUBSET of canonical EPMX skill names (encompass-api, roam-api, max-as-consultant) for stable tests; sample the rest randomly.

## Appendix A — file inventory

New files in kit:
- `packages/core/src/migrate.ts` — plan generation, action execution
- `packages/core/test/migrate-plan.test.ts` — plan generation tests
- `packages/core/test/migrate-apply.test.ts` — apply tests
- `packages/cli/src/commands/migrate/index.ts` — CLI command group
- `packages/cli/src/commands/migrate/plan.ts`, `apply.ts`, `status.ts`, `clean.ts`
- `packages/cli/test/migrate-cli.test.ts`
- `packages/templates/src/skills/ai-context-migrate/SKILL.md`
- `packages/templates/src/skills/ai-context-migrate/references/{overlap-detection,family-routing,legacy-md-conversion,post-migration-verification}.md`
- `scripts/epmx-gauntlet/run.sh`
- `scripts/epmx-gauntlet/README.md`
- `docs/migrating-existing-repos.md` — public consumer-facing guide
- `.changeset/migrate-cli-and-skill.md` — release changeset

Modified files in kit:
- `packages/core/src/types.ts` — add `MigratePlan`, `MigrateEntry`, `MigrateAction` types
- `packages/core/src/errors.ts` — add `AICTX_MIGRATE_*` error codes
- `packages/core/src/index.ts` — re-export migrate functions
- `packages/cli/src/index.ts` — register `migrate` command group
- `packages/templates/src/skills-bundler.ts` — bundle the new `ai-context-migrate` skill alongside `ai-context-kit`
- `docs/cli-contract.md` — document migrate subcommands + exit codes
- `docs/skills-guide.md` — link to migrating-existing-repos.md
- `README.md` — note the 1.1 migration capability

EPMX-side files (separate PR):
- Migration commits (~40) under `feat/migrate-to-ai-context-kit-skills` branch
- Possibly a small CLAUDE.md / AGENTS.md regeneration after build

## Appendix B — relationship to v1.0

This work builds on v1.0.0 (PR #3):
- The skills subsystem (source/mirror/symlink machinery) is unchanged
- The `ai-context-kit` meta-skill is unchanged; the new `ai-context-migrate` is a sibling
- The kit-awareness stanza in generated AGENTS.md/CLAUDE.md is unchanged
- All existing gauntlet stages (1-11) continue to pass

The migration capability is a layer ON TOP of v1.0's primitives — it uses `discoverSkills`, `planSkillMirrors`, `applySkillMirrors` internally for the actual file operations.
