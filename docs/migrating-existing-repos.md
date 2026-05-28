# Migrating an Existing Repo to ai-context-kit Skills

Step-by-step guide for adopting ai-context-kit 1.1+ in a repo that already has skills scattered across `.claude/skills/` or other legacy locations.

## Prerequisites

- Kit version 1.1.0+ installed: `pnpm add -D @timothycrooker/ai-context-cli`
- Git working tree is clean (migration requires this)
- Manifest at `.ai/context/manifest.json` exists (run `ai-context init --upgrade` first if not)

## The 4-phase migration

### Phase 1: Audit

```bash
ai-context migrate plan
```

This scans your `.claude/skills/` and other legacy locations, then writes `.ai/migration-plan.json`. The plan shows:
- How many skills found
- Which action will apply to each (move_dir, promote_bare_md, consolidate_symlink, keep_existing)
- Any warnings (e.g., missing skills block in manifest)

**Review the plan** before proceeding:

```bash
cat .ai/migration-plan.json
ai-context migrate status
```

### Phase 2: Curate (optional)

Open an AI session (Claude, Codex, or Gemini) and prompt:

> "Please review the .ai/migration-plan.json file. Use the ai-context-migrate skill to audit for overlap and quality. Edit the plan if needed, then report your findings."

The agent will use the bundled `ai-context-migrate` skill to examine your skills and decide whether to keep duplicates, factor shared content, etc.

You can SKIP this phase if you trust the auto-generated plan.

### Phase 3: Apply

```bash
ai-context migrate apply --dry-run    # see what would change
ai-context migrate apply              # execute
```

Each plan entry becomes its own git commit. Partial rollback is possible via `git reset --hard <pre-migration-sha>`.

### Phase 4: Verify

```bash
ai-context build       # regenerate AGENTS.md/CLAUDE.md + mirror symlinks
ai-context verify      # confirm clean state
ai-context doctor      # check for issues
ai-context skills list # confirm all skills present with symlink mirrors
```

## Troubleshooting

- **"Git tree is not clean"** — commit or stash your changes first
- **"manifest.skills not configured"** — run `ai-context init --upgrade` to add the skills block
- **"Plan already exists"** — use `ai-context migrate plan --force` to regenerate, or `ai-context migrate clean` if the previous one is applied
- **A skill is now broken (missing references)** — the migration preserves files but doesn't update cross-skill path references. Search your skill bodies for the old `.claude/skills/<name>` paths and update to the new locations.

## Reverting

```bash
git log --oneline | grep "chore(migrate)"   # find migration commits
git reset --hard <pre-migration-sha>
```
