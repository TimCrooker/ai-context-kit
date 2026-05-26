# Authoring Skills

A skill is an agent capability that loads **on demand** — agents discover it from a description and pull the full content when they need it. Unlike modules (always-present context), skills are loaded only when the agent decides they're relevant to the current task.

Skills follow the [agentskills.io](https://agentskills.io) spec.

## Authoring workflow (REQUIRED)

Adding a new skill takes 3 steps:

1. **Create the source** at `.ai/skills/<name>/SKILL.md` (with `name:` matching the directory and a `description:` field).
2. **Run `ai-context build`** from the repo root. This creates mirror symlinks at `.agents/skills/<name>` and `.claude/skills/<name>`. **You cannot skip this step** — without it, no agent CLI will discover your skill.
3. **Verify** with `ai-context skills list` — your new skill should appear with mirror state `symlink`.

**Easy mode:** `ai-context skills create <name> --description "..."` does all three steps for you. Prefer this over manual scaffold-then-build whenever possible.

### What NOT to do

- **Do not** create files directly in `.agents/skills/` or `.claude/skills/`. Those locations are symlink targets managed by the kit. Manually-created files will be inconsistent with the source and either confuse agents or get overwritten on the next build.
- **Do not** rely on automatic synchronization — there is none. The kit only updates mirrors when you run `ai-context build`.
- **Do not** invoke `cp`, `ln -s`, or manual `mkdir` on the mirror paths. Always use `ai-context build`.

### If the CLI isn't on your PATH

Use one of these forms depending on how the kit is installed:

- **Local install (the common case):** `pnpm exec ai-context build` or `npx ai-context build`
- **Global install:** `ai-context build`
- **Development (kit source clone):** `node packages/cli/dist/index.js build` (requires the kit to have been built first)

## Source location

Skills live in a **directory**, not a single file:

```
.ai/skills/<skill-name>/
  SKILL.md              # required — frontmatter + body
  references/           # optional — deep reference docs linked from SKILL.md
  scripts/              # optional — helper scripts the skill describes
  assets/               # optional — diagrams, fixtures, etc.
```

The directory name is the skill's canonical name. It must be kebab-case (`[a-z0-9-]`, no leading/trailing/consecutive hyphens, max 64 chars).

## Required frontmatter

Every `SKILL.md` must open with YAML frontmatter:

```yaml
---
name: my-skill                     # kebab-case, must match directory name
description: >
  Use when doing X or Y. Triggers  # 1–1024 chars; this is what the agent reads
  on phrases like "do X", "Y task".
---
```

Both `name` and `description` are required. The kit enforces this at build time.

### Writing an effective description

The description is the agent's trigger. It should answer: **when should I load this?** Include:
- The domain or task type
- Trigger phrases or file patterns
- What you'll gain from loading it

Bad: `"Skill for API work."`
Good: `"Use when writing or debugging Express route handlers, controllers, or services in apps/api/. Triggers on 'add endpoint', 'route handler', 'controller', or any mention of src/routes/. Covers REST conventions, Zod validation pattern, and error handling."`

## Optional frontmatter fields

| Field | Type | Description |
|---|---|---|
| `scope` | string[] | Scope IDs this skill emits to. Omit for root-only. `['*']` = root + every scope. |
| `license` | string | SPDX license identifier |
| `compatibility` | string | Agent/CLI version compatibility hint |
| `metadata` | object | Arbitrary key-value for tooling |
| `allowed-tools` | string or string[] | Tool names the skill is permitted to use |

## Creating a skill

### Via CLI (recommended — runs `ai-context build` for you)

```bash
ai-context skills create my-skill \
  --description "Use when working on X. Triggers on 'do X'." \
  --with-references \
  --with-scripts
```

The kit scaffolds the directory, writes `SKILL.md`, and **automatically runs `ai-context build`** to create mirror symlinks. This is the easiest path and avoids the most common mistake (forgetting to run `build` after creating the source).

### Manually

1. Create the directory: `mkdir -p .ai/skills/my-skill`
2. Write `.ai/skills/my-skill/SKILL.md` with valid frontmatter
3. **Run `ai-context build`** — this step is required. The kit creates mirror symlinks at `.agents/skills/my-skill` and `.claude/skills/my-skill`. **Do not skip it and do not create those files manually.**

## Mirror semantics

The kit creates symlinks at build time:

```
.ai/skills/my-skill/       ← source (you edit this)
.agents/skills/my-skill    ← symlink → ../../.ai/skills/my-skill
.claude/skills/my-skill    ← symlink → ../../.ai/skills/my-skill
```

Edits to any path reach the source through the symlink — they share an inode. On Windows or filesystems without symlink support, the kit falls back to a file copy (and adds a `<!-- _generated: do not edit here. -->` banner to the copy).

## Monorepo scoping

A skill with no `scope` field mirrors at the repo root only.

```yaml
scope: [api]       # mirrors into apps/api/.agents/skills/ and apps/api/.claude/skills/
scope: [api, web]  # mirrors into both package directories
scope: ['*']       # root + every scope defined in manifest.json
```

The `scope` values must match keys in `manifest.json` targets (excluding `root`).

## Complete SKILL.md example

```markdown
---
name: express-routes
description: >
  Use when adding, editing, or debugging Express route handlers, controllers,
  or middleware in apps/api/. Triggers on "add endpoint", "route handler",
  "controller", "middleware", or any file under src/routes/ or src/controllers/.
scope:
  - api
allowed-tools:
  - Bash
  - Read
---

# Express Routes

Route handlers must be thin. All business logic lives in services.

## File structure

```
src/
  routes/<name>.routes.ts       # Route definitions + middleware chain
  controllers/<name>.controller.ts  # Request/response handling only
  services/<name>.service.ts    # Business logic
```

## Conventions

- Validate input with `zodValidate(Schema)` middleware before the controller
- Controllers call one service method and return; no logic in controllers
- Use `ApiError` for structured errors — never `throw new Error(...)` in a controller
- Register routes in `src/config/router.config.ts`

## Verification

- `pnpm --filter @acme/api test` after any route change
- `pnpm type-check` — zero errors required

## Gotchas

- `zodValidate` mutates `req.validated` — always read from there, never `req.body` directly
- Route files are not auto-discovered — you must register in `router.config.ts`
```

## References

For the full agentskills.io spec, see: [agentskills.io specification](https://agentskills.io/spec)
