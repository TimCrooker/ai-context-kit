# Authoring Scopes

A scope ties a package or app to a specific agent-context target. It controls which rule files Claude loads for that package, which include files are appended to AGENTS.md for Codex, and which path globs trigger the rules.

## File location

```
.ai/context/scopes.json
```

## Top-level schema

```json
{
  "$schema": "./schemas/scopes.schema.json",
  "version": 1,
  "claudeRulesDir": ".claude/rules",
  "scopes": [ /* ScopeDefinition[] */ ]
}
```

`claudeRulesDir` tells the kit where to emit `.claude/rules/*.md` files (default: `.claude/rules`).

## ScopeDefinition fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique identifier; should match a key in `manifest.json` targets |
| `codexTarget` | string | no | Which manifest target receives Codex includes for this scope |
| `includes` | string[] | no | Markdown files appended to both Codex and Claude outputs |
| `codexIncludes` | string[] | no | Markdown files appended to Codex output only |
| `claudeIncludes` | string[] | no | Markdown files appended to Claude output only |
| `codexAgents` | string[] | no | Paths to child `AGENTS.md` files for Codex child-agent linking |
| `claudeMemories` | string[] | no | Paths to memory files for Claude memory injection |
| `claudeRuleFile` | string | no | Filename (no path) emitted into `claudeRulesDir` |
| `claudePaths` | string[] | no | Glob patterns that trigger this Claude rule (written into the rule file) |
| `parity` | boolean | no | Whether Codex and Claude outputs should stay in sync (advisory) |
| `reason` | string | no | Human-readable note explaining why this scope exists |

## How a scope relates to a manifest target

The `id` field of a scope should match a key in `.ai/context/manifest.json`'s `targets` map. The kit uses the target to determine where scoped AGENTS.md files are written and where skill mirrors land for that scope.

Example pairing:

```json
// manifest.json
{
  "targets": {
    "root": "AGENTS.md",
    "api":  "apps/api/AGENTS.md"
  }
}

// scopes.json
{
  "scopes": [
    { "id": "api", "codexTarget": "api", ... }
  ]
}
```

## Step-by-step: adding a scope for a new `mobile` app

1. **Add target to `manifest.json`**:
   ```json
   "targets": {
     "root": "AGENTS.md",
     "mobile": "apps/mobile/AGENTS.md"
   }
   ```

2. **Add scope to `scopes.json`**:
   ```json
   {
     "id": "mobile",
     "codexTarget": "mobile",
     "claudeRuleFile": "mobile-core.md",
     "claudePaths": ["apps/mobile/**"],
     "claudeIncludes": [".ai/rules/mobile-core.md"],
     "reason": "Mobile app scope with Claude path-globbed rules"
   }
   ```

3. **Create the rule file** (if using `claudeIncludes`):
   ```
   .ai/rules/mobile-core.md
   ```

4. **Run build**:
   ```bash
   ai-context build
   ```
   The kit emits `.claude/rules/mobile-core.md` and `apps/mobile/AGENTS.md`.

## Complete scope object example

```json
{
  "id": "api",
  "codexTarget": "api",
  "claudeRuleFile": "api-core.md",
  "claudePaths": [
    "apps/api/src/**",
    "apps/api/tests/**"
  ],
  "claudeIncludes": [
    ".ai/rules/api-core.md",
    ".ai/rules/testing.md"
  ],
  "codexIncludes": [
    ".ai/rules/api-core.md"
  ],
  "parity": true,
  "reason": "Express API with strict REST conventions"
}
```

## Common mistakes

| Mistake | Fix |
|---|---|
| `id` doesn't match any key in `manifest.json` targets | Add the target to manifest, or rename the scope id |
| `claudeRuleFile: "rules/api-core.md"` (path, not filename) | Just the filename: `"api-core.md"` |
| Including a non-existent file in `claudeIncludes` | Create the file under `.ai/rules/` first |
| Setting `codexTarget` to a target that isn't in manifest | Add the target to manifest or remove `codexTarget` |
