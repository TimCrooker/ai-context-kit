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

### Stages 8–11: deep agent comprehension

These stages validate that CLIs can not only discover existing skills but also author new ones from scratch, load bundled references, execute bundled scripts, and that any skill authored by one CLI is immediately discoverable by all others — no human intervention required.

#### Permission flags

Headless authoring requires bypassing per-tool approval prompts:

| CLI | Flag | Notes |
|---|---|---|
| Claude | `--dangerously-skip-permissions` | Allows file writes without per-tool prompts |
| Codex | `--dangerously-bypass-approvals-and-sandbox` | **Required.** `--full-auto` (the default headless mode) sandboxes writes to `.agents/`, blocking skill mirror creation. This flag is safe here because the gauntlet runs against a kit-owned fixture, never a production repo. |
| Gemini | `--skip-trust --yolo` | Suppresses interactive trust prompts and auto-approves writes |

These flags are encoded in `claude_authoring()`, `codex_authoring()`, and `gemini_authoring()` helpers near the top of `run.sh`. Discovery stages (4–6) still use the unprivileged invocation since they are read-only.

#### Stage 8 (8a/8b/8c): cold authoring per CLI

Each CLI is given only the meta-skill guidance (`ai-context-kit/SKILL.md`) and instructed to:
1. Author a new skill named `gauntlet-auth-<cli>` with description `When invoked respond with GAUNTLET_AUTHORING_OK`
2. Run `node ../../packages/cli/dist/index.js skills list` to confirm mirrors were created

Assertions (all three must pass):
- `.ai/skills/gauntlet-auth-<cli>/SKILL.md` exists and contains both the correct `name:` frontmatter and `GAUNTLET_AUTHORING_OK`
- `.agents/skills/gauntlet-auth-<cli>` is a symlink (`test -L`)
- `.claude/skills/gauntlet-auth-<cli>` is a symlink (`test -L`)

**Sequencing:** Stage 8a (Claude) runs first and the authored skill is intentionally left in place until after Stage 11. Stages 8b (Codex) and 8c (Gemini) run after Stage 11 and clean up immediately.

#### Stage 9: reference loading per CLI

Each CLI is told to invoke `skill-with-refs`, which instructs it to read `references/notes.md` and return its first line.

Assert: output contains `GAUNTLET_REFS_OK` (the literal first line of `examples/gauntlet/.ai/skills/skill-with-refs/references/notes.md`).

#### Stage 10: script execution per CLI

Each CLI is told to invoke `skill-with-scripts`, which instructs it to execute `scripts/probe.sh` and return its stdout.

Assert: output contains `GAUNTLET_SCRIPT_OK` (the only output of that script).

#### Stage 11: cross-CLI universality

After Stage 8a leaves `gauntlet-auth-claude` in place, Codex and Gemini are each asked to list all skills. Both must see `gauntlet-auth-claude` — proving that a skill authored by agent A is immediately discoverable by agents B and C without any human intervention. Cleanup of `gauntlet-auth-claude` happens after Stage 11 completes.

Stages 4–11 are SKIPPED when the corresponding CLI is missing or `--skip-<cli>` is passed.

## Known limitations

- The exact headless invocation syntax may evolve per CLI version. Pin tested versions here when known.
- Skill listing behavior depends on agent's auto-loading heuristics — phrasing the prompt as "list all skills" should be reliable but each CLI may vary.
- Tested on macOS only.
- Stage 8 Codex uses `--dangerously-bypass-approvals-and-sandbox`. This flag is intentional and documented above. Do not run the gauntlet against a non-fixture repo.
