# Skills Guide

How `ai-context-kit` manages cross-CLI skills (Claude Code, Codex, Gemini, Cursor, Goose, OpenCode, Aider, and 17+ other tools on the agents.md compatibility list).

> **Have an existing repo with skills already in `.claude/skills/`?** See [docs/migrating-existing-repos.md](migrating-existing-repos.md) for the migration workflow.

## TL;DR

Author skills once at `.ai/skills/<name>/SKILL.md`. Run `ai-context build`. Every agent CLI sees them.

## What is a skill?

A skill is a directory containing a `SKILL.md` file (per the [agentskills.io](https://agentskills.io) open standard) plus optional `references/`, `scripts/`, and `assets/` subdirectories. SKILL.md has YAML frontmatter declaring `name` + `description`. Agents auto-load the skill when its description matches the current task.

## How it works

`.ai/skills/<name>/` is the source. `ai-context build` creates **symlinks** at every path listed in `manifest.skills.mirrors` (default `.agents/skills/<name>` and `.claude/skills/<name>`). All three locations resolve to the same file on disk — edit any of them, and the source is updated.

## Authoring a new skill

```bash
ai-context skills create my-skill --description "What this skill does"
```

This scaffolds `.ai/skills/my-skill/SKILL.md`, creates the mirror symlinks, and you can immediately start editing the SKILL.md body.

## Adding references and scripts

```bash
ai-context skills create my-skill --description "..." --with-references --with-scripts
```

This scaffolds `references/example.md` and `scripts/example.sh` alongside `SKILL.md`. Reference them from the SKILL.md body — agents load them on demand.

## Monorepo: per-package skills

Add `scope:` to the skill's frontmatter:

```yaml
---
name: api-conventions
description: HTTP API conventions for the api package
scope: [api]
---
```

The skill emits to `apps/api/.agents/skills/api-conventions` and `apps/api/.claude/skills/api-conventions` instead of repo root. Use `scope: ["*"]` to emit at root AND every scope.

## Windows users

Symlinks need Developer Mode enabled (Settings → Update & Security → For developers) and `git config core.symlinks true`. Without them, the kit falls back to copying skill content with a `_generated:` banner. `ai-context doctor` reports the fallback.

## Don't

- Don't put two skills in nested subdirectories: `.ai/skills/foo/bar/SKILL.md` is not discovered as a skill named `bar`. Skills are flat.
- Don't author a skill named the same as the kit's meta-skill (`ai-context-kit`) — that name is reserved.
- Don't edit `.claude/skills/` or `.agents/skills/` content as if they were copies — they're symlinks, edits propagate to source. (This is a feature on macOS/Linux; a confusion on Windows where they may be copies.)

## See also

- `docs/content-guide.md` — when to use a skill vs a module vs a rule
- The meta-skill at `.ai/skills/ai-context-kit/` — installed in every kit-using repo, explains everything in detail to agents in your repo
- [agentskills.io specification](https://agentskills.io/specification)
- [Claude Code skills docs](https://code.claude.com/docs/en/skills)
