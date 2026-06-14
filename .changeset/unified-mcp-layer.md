---
"@timothycrooker/ai-context-core": minor
"@timothycrooker/ai-context-cli": minor
"@timothycrooker/ai-context-templates": patch
---

Add a unified MCP layer — MCP is now a third generated primitive alongside context and skills.

Declare MCP servers once in `.ai/mcp.json`; `ai-context build` fans them out to each agent client's native config (Claude `.mcp.json`, Codex `.codex/config.toml`). Servers can carry backing: a linked skill (auto by co-name or explicit) and a one-line catalog entry in `AGENTS.md`/`CLAUDE.md` so an agent gets the tool and the knowledge to use it.

- `project`-scope servers are committed; `user`-scope servers install per-machine via `ai-context mcp install <name> --user`.
- Secrets stay as `${VAR}` references (resolved from `.ai/secrets.local.env`); `ai-context verify` fails on a credential literal in a generated config.
- New CLI: `ai-context mcp list | install --user | setup`.
- v1 ships `claude` + `codex` adapters behind a pluggable registry.
