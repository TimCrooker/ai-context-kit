# Compatibility

## Shared Source

- Modules: `.ai/context/modules/*.md`
- Rules: `.ai/rules/*.md`

## Codex Output

- Root canonical `AGENTS.md` from root modules.
- Scoped `AGENTS.md` files from scope includes.

## Claude Output

- Root canonical `CLAUDE.md` from root modules.
- Scoped `CLAUDE.md` files from `claudeMemories`.
- Optional `.claude/rules/*.md` from `claudeRuleFile` + `claudePaths`.

## Thin Root + JIT Scope

Use thin root docs and push domain detail into app/path scoped files to keep active context local and reduce token pressure.
