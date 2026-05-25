# Gauntlet runner

Cross-CLI skill discovery test harness. Runs `examples/gauntlet/` through Claude Code, Codex, and Gemini headlessly and asserts each CLI sees and can invoke every skill shape.

## Prerequisites

| CLI | Install | Auth |
|---|---|---|
| Claude Code | `npm i -g @anthropic-ai/claude-code` (or built-in on this machine) | API key in `~/.claude/auth.json` or `ANTHROPIC_API_KEY` |
| Codex CLI | per OpenAI docs | OAuth flow per Codex onboarding |
| Gemini CLI | per Google docs | OAuth flow per Gemini onboarding |

## Usage

```bash
# Run full gauntlet
pnpm gauntlet

# Skip specific CLIs (if not installed/authenticated)
pnpm gauntlet -- --skip-claude
pnpm gauntlet -- --skip-codex
pnpm gauntlet -- --skip-gemini
```

Results land in `examples/gauntlet/results/<timestamp>.md` plus per-CLI transcripts.

## Stages

1. **Emission test** — `ai-context build` in fixture; asserts 7 specific mirror paths exist
2. **Edit propagation** — edit `.claude/` path; assert source is updated (shared inode)
3. **Force-copy fallback** — `AI_CONTEXT_FORCE_COPY_FALLBACK=1 ai-context build`; asserts `_generated:` banner present
4. **Claude headless discovery** — `claude -p "List the names of every skill"` ; expect plain-skill, skill-with-refs, skill-with-scripts, router-skill in output
5. **Codex headless discovery** — `codex exec "List ..."` ; same assertions
6. **Gemini headless discovery** — `gemini -p "List ..."` ; same assertions
7. **Meta-skill awareness** — `claude -p "How do I add a new context module?"` ; expect citation of authoring-modules.md

Stages 4–7 are SKIPPED when the corresponding CLI is missing or `--skip-<cli>` is passed.

## Known limitations

- The exact headless invocation syntax may evolve per CLI version. Pin tested versions here when known.
- Skill listing behavior depends on agent's auto-loading heuristics — phrasing the prompt as "list all skills" should be reliable but each CLI may vary.
- Tested on macOS only.
