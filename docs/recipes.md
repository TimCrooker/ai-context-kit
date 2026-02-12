# Recipes

## Single Application

```bash
ai-context init                     # auto-detects standard template
ai-context build
ai-context doctor                   # check content quality
```

The `standard` template creates one scope with `claudeRuleFile` targeting `src/**`.
Add your project-specific conventions, verification commands, and gotchas to `.ai/rules/`.

## Monorepo Apps

```bash
ai-context init --template monorepo
ai-context build
ai-context doctor
```

1. Add one scope per top-level app.
2. Map each `codexTarget` to a manifest target output path.
3. Generate one app-level `AGENTS.md` and one app-level `CLAUDE.md`.

## Backend + Web + Mobile

- Keep common policy modules in root target.
- Assign app-specific rules in per-scope includes.
- Keep reference/deep docs out of default includes.

## Path-Scoped Claude Rules

Use `claudeRuleFile` only for precise path globs where directory-scoped `CLAUDE.md` is too broad.

## Content Quality Checklist

Every rule file (`.ai/rules/*.md`) should include:

- **Description**: What this file covers and which key files it applies to
- **Conventions**: Naming, patterns, and structural rules
- **Verification**: Exact commands to run after changes
- **Gotchas**: Non-obvious traps that cause agent mistakes

Run `ai-context doctor` to get automated content quality suggestions.

## Progressive Disclosure

Keep root modules (`.ai/context/modules/`) lean (under 80 lines). They are inlined into every generated output. Push domain-specific details into `.ai/rules/` files that are only included in relevant scopes.

```
Root module:  "We use Express + tRPC. Auth middleware runs first."
Rule file:    "The auth middleware sets req.tenantId — never read tenant from body."
```

This keeps the shared context small while giving each scope the detail it needs.
