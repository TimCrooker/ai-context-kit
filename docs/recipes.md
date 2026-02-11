# Recipes

## Monorepo Apps

1. Add one scope per top-level app.
2. Map each `codexTarget` to a manifest target output path.
3. Generate one app-level `AGENTS.md` and one app-level `CLAUDE.md`.

## Backend + Web + Mobile

- Keep common policy modules in root target.
- Assign app-specific rules in per-scope includes.
- Keep reference/deep docs out of default includes.

## Path-Scoped Claude Rules

Use `claudeRuleFile` only for precise path globs where directory-scoped `CLAUDE.md` is too broad.
