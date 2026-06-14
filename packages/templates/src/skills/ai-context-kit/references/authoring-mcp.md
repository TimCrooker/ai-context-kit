# Authoring MCP servers

Register Model Context Protocol (MCP) servers once in `.ai/mcp.json`. On `ai-context build`, the kit fans each server out to every agent client's native config and (optionally) advertises it in the AGENTS.md / CLAUDE.md catalog. MCP is the kit's third primitive, alongside context and skills.

## Enable it

Add an `mcp` block to `.ai/context/manifest.json`:

```json
{
  "mcp": { "registry": ".ai/mcp.json", "clients": ["claude", "codex"] }
}
```

`clients` is the set of adapters this repo emits. v1 ships `claude` and `codex`.

## Declare servers

`.ai/mcp.json`:

```json
{
  "version": 1,
  "servers": [
    {
      "name": "posthog",
      "transport": { "type": "http", "url": "https://mcp.posthog.com/mcp" },
      "scope": "project",
      "targets": ["claude", "codex"],
      "env": { "POSTHOG_PERSONAL_API_KEY": "${POSTHOG_PERSONAL_API_KEY}" },
      "skill": "analytics-ops",
      "context": true
    },
    {
      "name": "ahrefs",
      "transport": { "type": "http", "url": "https://api.ahrefs.com/mcp/mcp" },
      "scope": "user",
      "targets": ["claude"],
      "auth": "oauth",
      "context": true
    }
  ]
}
```

Field reference:

| Field | Meaning |
|---|---|
| `name` | Lowercase, hyphenated identifier. Unique. |
| `transport` | `{ "type": "http"\|"sse", "url" }` or `{ "type": "stdio", "command", "args"? }`. |
| `scope` | `project` (committed config) or `user` (per-machine, not committed). |
| `targets` | Which clients get this server. |
| `auth` | `oauth` \| `env` \| `none` — drives the setup hint. |
| `env` | Map of env var injections. **Values must be `${VAR}` references.** |
| `skill` | Backing skill name. Defaults to a co-named `.ai/skills/<name>`. |
| `context` | When `true`, list the server in the AGENTS/CLAUDE catalog. |
| `setup` | Optional shell command run by `ai-context mcp setup <name>`. |

## What the build emits

- **Claude** → `.mcp.json` (`mcpServers` map)
- **Codex** → `.codex/config.toml` (`[mcp_servers.<name>]` tables). If a hand-written `.codex/config.toml` already exists, the kit writes `.codex/mcp.toml` instead so it never clobbers your budget config.
- **Catalog** → an "Available MCP servers" block appended to the root AGENTS.md / CLAUDE.md for `context: true` servers, pointing at each server's backing skill.

Only `project`-scope servers are written into committed files.

## Secrets

Never put a literal secret in `env`. Use `${VAR}` references; values resolve from `.ai/secrets.local.env` at the agent's runtime. `ai-context verify` fails the build if a credential-looking literal appears in a generated config (`AICTX_MCP_SECRET_LEAK`) or in the registry itself (`AICTX_MCP_SECRET_LITERAL`).

## User-scope servers

`scope: "user"` servers are personal (your own API keys, not the team's). They are not written into the repo. Install them per-machine:

```bash
ai-context mcp install <name> --user   # writes to your client's user config
ai-context mcp setup <name>            # runs setup, or prints the auth hint
```

Remote/OAuth servers: the kit emits the declaration, but authentication is always per-user — run `/mcp` in your client after install.

## Commands

```bash
ai-context mcp list                      # show registered servers + backing skills
ai-context mcp install <name> --user     # install a user-scope server
ai-context mcp setup <name>              # run setup / print auth hint
ai-context build                         # (re)generate all client configs
ai-context verify                        # fail if configs are stale or leak secrets
```
