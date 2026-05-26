<!--
  GENERATED FILE: Do not edit directly.
  Source: .ai/context/scopes.json
  Build: ai-context build
-->
# Claude Instructions

This file is generated from `.ai/context/scopes.json` by `ai-context build`.
Edit scope definitions and re-run the build instead of editing this file directly.

## Working in this repo

This repo's context and skills are managed by [ai-context-kit](https://github.com/TimCrooker/ai-context-kit). For authoring guidance, schema reference, or to add a new module/scope/skill, invoke the `/ai-context-kit` skill (or just ask about modules/scopes/skills — the skill auto-loads on those keywords).

Run `ai-context build` after editing anything under `.ai/`. Generated files are: AGENTS.md, CLAUDE.md, .claude/rules/*.md, .agents/skills/*, .claude/skills/*.

---

## Shared Canonical Context (Inlined)

<!-- Source: .ai/context/modules/*.md -->
# Gauntlet fixture

Fixture monorepo for the ai-context-kit cross-CLI gauntlet. Exercises every skill shape.

## Claude-Specific Notes

- Use scoped `CLAUDE.md` files for domain-specific, just-in-time context.
- Reserve `.claude/rules/*.md` for narrow path-glob injections only.
- Keep local secrets in `.ai/secrets.local.env` (gitignored).
