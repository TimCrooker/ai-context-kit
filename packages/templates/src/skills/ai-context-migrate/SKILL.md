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
3. **Apply** — after your curation, the user (or you) runs `ai-context migrate apply` to execute.
4. **Verify** — `ai-context build && verify && doctor` confirms healthy state.

## Your job in Phase 2

1. Read `.ai/migration-plan.json`. Confirm it exists, is unapplied, and has reasonable summary counts.
2. For each `review_candidate`: examine the underlying source files, decide what to do (see `references/overlap-detection.md`).
3. For each main entry: spot-check whether the auto-classification is correct (e.g., is a `keep_existing` entry actually a real skill being missed?).
4. If you find clusters of overlap NOT flagged by the CLI: cross-reference the family-router pattern in `references/family-routing.md` and decide whether to factor common content into shared references/ files.
5. Edit the plan: change actions, add `REVIEW` resolutions, add new entries for content abstraction.
6. Tell the user what you decided and why. Do NOT auto-run `apply` — that's their decision.

## What you don't do

- Don't apply the plan. That's Phase 3, gated by the user.
- Don't move files around manually. The plan is the artifact; apply executes.
- Don't dedupe aggressively without rationale. If two skills look similar but serve distinct purposes (e.g., router + specialty), keep both.

## See also

- `references/overlap-detection.md` — heuristics for finding redundancy
- `references/family-routing.md` — router-skill consolidation rules
- `references/legacy-md-conversion.md` — promoting bare-MD slash commands
- `references/post-migration-verification.md` — checklist for Phase 4
