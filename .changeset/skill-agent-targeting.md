---
"@timothycrooker/ai-context-core": minor
"@timothycrooker/ai-context-cli": minor
"@timothycrooker/ai-context-templates": patch
---

Per-skill agent targeting — restrict a skill to specific agents' mirror directories.

Skills can now declare `agents:` (whitelist) or `excludeAgents:` (blacklist, mutually exclusive) in SKILL.md frontmatter. Agent IDs derive from each `manifest.skills.mirrors` path's first segment minus the leading dot (`.claude/skills` → `claude`, `.agents/skills` → `agents`), so a claude-only skill is simply `agents: [claude]` — it emits to `.claude/skills/` but stays invisible to Codex and other consumers of `.agents/skills/`.

- Unknown agent IDs fail the build with the new `AICTX_SKILL_AGENT_UNKNOWN` error.
- Orphan detection is now plan-aware: adding a filter to an existing skill and running `ai-context build --remove-orphans` deletes the now-excluded mirrors; `doctor` flags them.
- `ai-context skills create` gains a repeatable `--agents <id>` flag; `skills list` shows the filter and includes `agents`/`excludeAgents` in `--json` output.
