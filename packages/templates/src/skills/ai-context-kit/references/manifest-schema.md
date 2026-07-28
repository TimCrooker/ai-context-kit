# manifest.json Schema

File: `.ai/context/manifest.json`

The manifest is the top-level configuration for ai-context-kit. It tells the kit where to find modules and scopes, where to write outputs, and whether skills are enabled.

## Fields

### `$schema` (optional, string)

JSON Schema reference for editor validation. The kit ships a schema at `.ai/context/schemas/manifest.schema.json`.

```json
"$schema": "./schemas/manifest.schema.json"
```

### `version` (required, must be `1`)

Schema version. Currently only `1` is valid.

### `modulesDir` (required, string)

Path (relative to repo root) where module source files live.

```json
"modulesDir": ".ai/context/modules"
```

### `scopesFile` (required, string)

Path (relative to repo root) to `scopes.json`.

```json
"scopesFile": ".ai/context/scopes.json"
```

### `targets` (required, object)

Map of target ID → output path (relative to repo root). **Must include a `root` key.** Other keys define per-scope outputs (usually one per monorepo package).

```json
"targets": {
  "root": "AGENTS.md",
  "api":  "apps/api/AGENTS.md",
  "web":  "apps/web/AGENTS.md"
}
```

The `root` target is the global AGENTS.md that every agent sees, and it is the only target modules compose into. Scoped targets are written from their scope's includes in `scopes.json` — every non-root target must be produced by some scope, or the build fails.

### `claudeOutput` (optional, string)

When set, the kit also generates a `CLAUDE.md` at this path (relative to repo root). The CLAUDE.md includes the same module content as AGENTS.md plus Claude-specific rule file wiring.

```json
"claudeOutput": "CLAUDE.md"
```

Omitting this field disables CLAUDE.md generation entirely.

### `skills` (optional, object)

Enables the skills subsystem. When present, the kit discovers skills in `source` and creates mirrors in every path listed under `mirrors`.

```json
"skills": {
  "source": ".ai/skills",
  "mirrors": [".agents/skills", ".claude/skills"],
  "metaSkill": true
}
```

#### `skills.source` (required when skills is set, string)

Directory (relative to repo root) where skill source directories live. Each subdirectory must contain a `SKILL.md`.

#### `skills.mirrors` (required when skills is set, string[])

Array of directory paths (relative to the emission root) where mirrors are created. Standard values:

| Path | Consumer |
|---|---|
| `.agents/skills` | Codex, Gemini, Cursor, Goose, and other AGENTS.md-aware agents |
| `.claude/skills` | Claude Code |

For scoped skills, mirrors land relative to the scope's package directory (e.g., `apps/api/.claude/skills/<name>`).

#### `skills.metaSkill` (optional, boolean, default `true`)

When `true`, `ai-context init` installs the kit's built-in `ai-context-kit` meta-skill into `.ai/skills/ai-context-kit/`. Use `ai-context init --refresh-meta-skill` to update it later.

## Complete working example

Monorepo with API and web scopes, skills enabled:

```json
{
  "$schema": "./.ai/context/schemas/manifest.schema.json",
  "version": 1,
  "modulesDir": ".ai/context/modules",
  "scopesFile": ".ai/context/scopes.json",
  "claudeOutput": "CLAUDE.md",
  "targets": {
    "root": "AGENTS.md",
    "api":  "apps/api/AGENTS.md",
    "web":  "apps/web/AGENTS.md"
  },
  "skills": {
    "source": ".ai/skills",
    "mirrors": [
      ".agents/skills",
      ".claude/skills"
    ],
    "metaSkill": true
  }
}
```

## Minimal single-app example

```json
{
  "$schema": "./.ai/context/schemas/manifest.schema.json",
  "version": 1,
  "modulesDir": ".ai/context/modules",
  "scopesFile": ".ai/context/scopes.json",
  "claudeOutput": "CLAUDE.md",
  "targets": {
    "root": "AGENTS.md"
  }
}
```

## Validation

Run `ai-context lint-config` to validate manifest structure, scope wiring, and module frontmatter. The kit uses a strict JSON Schema (`additionalProperties: false`) — unknown fields are rejected.
