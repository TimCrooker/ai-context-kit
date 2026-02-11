# Configuration

## `.ai/context/manifest.json`

Required keys:

- `version` (must be `1`)
- `modulesDir`
- `scopesFile`
- `targets`

Optional keys:

- `claudeOutput` (default: `CLAUDE.md`)

Rules:

- `targets.root` must exist.
- Non-root targets should be mapped by `scopes[].codexTarget`.

## `.ai/context/scopes.json`

Required keys:

- `version` (must be `1`)
- `scopes[]`

Optional:

- `claudeRulesDir`

Scope keys:

- `id`
- `codexTarget`
- `includes` / `codexIncludes` / `claudeIncludes`
- `codexAgents`
- `claudeMemories`
- `claudeRuleFile`
- `claudePaths`
- `parity`
- `reason`

Constraints:

- `claudeRuleFile` requires `claudePaths` and `claudeRulesDir`.
- `claudeRuleFile` and `claudeMemories` cannot coexist in one scope.
- Generated output paths must be unique.
- By default, scope parity is enforced between Codex and Claude scoped outputs.
