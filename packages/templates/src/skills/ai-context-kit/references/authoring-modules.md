# Authoring Context Modules

A context module is a markdown file that gets composed into `AGENTS.md` and/or `CLAUDE.md` at build time. Modules are **always-present** context — every agent that loads the generated output sees every module targeted at that output. Keep them lean.

## File location

```
.ai/context/modules/<NNN>-<name>.md
```

The `NNN` prefix is a zero-padded number (e.g. `010`, `020`, `100`). It controls sort order within a target — lower numbers appear first in the generated output. Leave gaps between numbers (use 10, 20, 30, not 1, 2, 3) so you can insert later without renumbering.

Examples:
- `.ai/context/modules/010-overview.md`
- `.ai/context/modules/050-architecture.md`
- `.ai/context/modules/200-conventions.md`

## Required frontmatter

Every module must open with a YAML frontmatter block:

```yaml
---
id: overview             # string, must match filename minus the NNN- prefix and .md extension
targets:
  - root                 # array of target IDs from manifest.json; at least one required
order: 10                # number; used as tiebreaker when two modules share the same NNN prefix
---
```

All three fields are required. The kit rejects modules with missing or mismatched frontmatter.

### `id`

Must match the filename with the leading `NNN-` prefix and `.md` extension stripped. For `010-project-overview.md` the id is `project-overview`.

### `targets`

Array of target IDs that appear as keys in `.ai/context/manifest.json`. The most common values:

| Value | Meaning |
|---|---|
| `root` | Emitted into the repo-root `AGENTS.md` / `CLAUDE.md` |
| `api` | Emitted into `apps/api/AGENTS.md` (if that target is defined) |
| `web` | Emitted into `apps/web/AGENTS.md` (if that target is defined) |

A module can list multiple targets:
```yaml
targets:
  - root
  - api
  - web
```

### `order`

Integer used as a secondary sort key when multiple modules have the same numeric prefix. Typically mirrors the numeric prefix (e.g. `order: 10` for `010-*.md`).

## Aggregation

At build time, the kit:
1. Reads all `*.md` files in `modulesDir`
2. Parses frontmatter from each
3. Groups modules by target
4. Sorts each group by `order` (ascending)
5. Concatenates bodies into the generated output, separated by blank lines
6. Writes the result to each target's output path

## Complete working example

File: `.ai/context/modules/010-project-overview.md`

```markdown
---
id: project-overview
targets:
  - root
order: 10
---
# Project Overview

This is a TypeScript monorepo for the Acme loan origination platform.

**Stack**: Node.js 20 + Express (API), Next.js 14 Pages Router (web), MongoDB, Redis.

**Key conventions**:
- Types flow from `packages/core-types` → API → web. Never import in reverse.
- Use `config.ts` for env access — never read `process.env` directly.
- Run `pnpm test` and `pnpm type-check` before committing.
```

## Common mistakes

| Mistake | Fix |
|---|---|
| `targets: [api]` but `api` isn't in `manifest.json` | Add the target to manifest, or use `root` |
| `id: project-overview` in `050-architecture.md` | `id` must match the filename stem: `architecture` |
| Frontmatter missing entirely | Every module must have `---` delimited frontmatter |
| Module over 80 lines | Split into two modules or move domain detail to a rule file under `.ai/rules/` |
| Agent tools / skills listed in a module | Modules are always-loaded prose context, not capability manifests — put capability info in a skill's SKILL.md |
| Putting path-specific rules in modules | Path-scoped guidance belongs in `.ai/rules/*.md` files, referenced by a scope's `claudeIncludes` |
