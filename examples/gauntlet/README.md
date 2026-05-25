# Gauntlet fixture

Synthetic kit-using monorepo exercising every skill shape. Driven by `scripts/gauntlet/run.sh`.

Each skill returns a unique magic string (`GAUNTLET_*_OK`) when correctly discovered + invoked by an agent CLI. The gauntlet asserts those strings appear in CLI output for each of Claude, Codex, and Gemini.

## Skills inventory

| Name | Shape | Magic string |
|---|---|---|
| plain-skill | bare SKILL.md | `GAUNTLET_PLAIN_OK` |
| skill-with-refs | SKILL.md + references/ | first line of references/notes.md: `GAUNTLET_REFS_OK` |
| skill-with-scripts | SKILL.md + scripts/ | output of scripts/probe.sh: `GAUNTLET_SCRIPT_OK` |
| api-scoped-skill | scope: [api] | `GAUNTLET_SCOPED_API_OK` (only discoverable from apps/api/) |
| router-skill | references siblings | `GAUNTLET_ROUTER_OK: plain-skill, skill-with-refs, skill-with-scripts, api-scoped-skill` |

Plus the kit's own meta-skill `ai-context-kit` (auto-installed).
