# EPMX Gauntlet

Cross-CLI skill discovery validation, adapted for the EPMX Monorepo.

This is the EPMX-specific variant of `scripts/gauntlet/run.sh`. After migrating EPMX via `ai-context migrate`, run this to confirm all 39 migrated skills are discoverable by Claude, Codex, and Gemini.

## Usage

```bash
# From the kit repo:
bash scripts/epmx-gauntlet/run.sh /path/to/EPMX-Monorepo

# Skip individual CLIs:
bash scripts/epmx-gauntlet/run.sh /path/to/EPMX-Monorepo --skip-codex
```

Results land in the EPMX repo at `examples/gauntlet/results/epmx-<timestamp>.md` and matching transcripts.

## Stages

1. **Emission** — `.ai/skills/`, `.agents/skills/`, `.claude/skills/` all populated with 39 entries
2. **Sample-skill discovery per CLI** — Claude/Codex/Gemini each list a representative sample (encompass-api, roam-api, max-as-consultant, backlog-triage) and find them
3. **Reference loading** — Claude is asked to invoke a skill that uses references (e.g., roam-api references/, graph-mail references/) and read its content
4. **Script execution** — Claude is asked to invoke a skill that has scripts/ (if any) and execute it
5. **Meta-skill awareness** — Each CLI is asked "how do I add a new context module to this repo?" and is expected to cite the ai-context-kit meta-skill content

This is shorter than the kit gauntlet because EPMX skills are real-world, varied, and we don't need exhaustive coverage of every shape.
