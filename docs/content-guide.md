# Content Guide

Writing effective AI context files is the single biggest lever for agent performance.
This guide covers what to write, how to structure it, and what to avoid.

## The Litmus Test

Before adding any line to a context or rule file, ask:

> **Would removing this cause the agent to make a mistake?**

If the answer is no, the line is noise. Remove it.

## Priority Hierarchy

Order content by how much damage a miss would cause:

| Priority | Category | Example |
|----------|----------|---------|
| 1 | **Gotchas** | "Never call `userService.delete()` without soft-delete flag — it purges PII immediately" |
| 2 | **Verification** | "Run `pnpm test --filter @app/api` after any router change" |
| 3 | **Conventions** | "Use `snake_case` for DB columns, `camelCase` for TypeScript" |
| 4 | **Architecture** | "API layer is Express + tRPC; auth middleware runs before all procedures" |
| 5 | **Examples** | Code snippets showing the correct pattern |

Agents recover from missing architecture context (they can infer it from code).
They do **not** recover from unknown gotchas.

## Rule File Anatomy

Every rule file should follow this structure:

```markdown
# <Domain> Rules

Brief description of what this rule file covers and which part of the codebase it applies to.

**Key files**: `src/routes/`, `src/services/`, `src/middleware/`

## Conventions

- Use Zod schemas for all request/response validation
- Keep route handlers under 20 lines; extract logic to services
- Name service files `<entity>.service.ts`

## Verification

- `pnpm test --filter @app/api` — must pass before any PR
- `pnpm typecheck` — zero errors required
- Check for N+1 queries when adding new includes

## Gotchas

- `userService.delete()` does a hard delete by default — always pass `{ soft: true }`
- The `auth` middleware sets `req.tenantId` — never read tenant from request body
- Rate limiter is per-IP in dev but per-tenant in prod; test both paths
```

### Section Breakdown

- **Description + Key files**: Orient the agent. One or two sentences plus the file paths this domain covers.
- **Conventions**: Naming, patterns, and structural rules the agent must follow when writing code.
- **Verification**: Exact commands and checks to run. Agents follow these literally.
- **Gotchas**: Non-obvious traps. This is the highest-value section — things an agent would get wrong without being told.

## What to Include vs Exclude

| Include | Exclude |
|---------|---------|
| Project-specific conventions | Language basics (`use const not var`) |
| Non-obvious constraints and traps | Obvious patterns (standard REST, basic CRUD) |
| Exact verification commands | Vague advice ("write good tests") |
| File paths that matter for a domain | Every file in the repo |
| Decisions that differ from defaults | Default framework behavior |
| Cross-cutting concerns (auth, tenancy) | Implementation details agents can read from code |

## Writing Style

**Imperative beats passive.** Write instructions, not descriptions.

| Good | Bad |
|------|-----|
| Run `pnpm test` after changes | Tests should be run |
| Never import from `internal/` | The `internal/` directory is private |
| Use `snake_case` for DB columns | DB columns are typically snake_case |
| Pass `{ soft: true }` to delete | The delete function supports a soft flag |

**Specific beats vague.**

| Good | Bad |
|------|-----|
| Keep route handlers under 20 lines | Keep code small |
| Run `pnpm --filter @app/api test` | Run the tests |
| Use `zod` for input validation | Validate inputs |

## Root Module Sizing

Root modules (`.ai/context/modules/`) are inlined into every generated output.
Keep them lean:

- **Under 80 lines** for project overview modules
- Focus on architecture and product boundaries
- Push domain-specific details into rule files (progressive disclosure)
- If a root module keeps growing, split it or move content to rules

Progressive disclosure means the root provides just enough context for the agent to
orient itself, while rule files deliver detailed guidance scoped to specific paths.

## Common Mistakes

1. **Restating the framework docs.** Agents already know how Express, React, and
   Drizzle work. Only document where your project diverges.

2. **Placeholder content.** Lines like `<!-- TODO: fill in -->` or
   `Add your rules here` are worse than nothing — they signal the file is not
   authoritative.

3. **Missing verification section.** Without explicit commands, agents guess
   which tests to run and often guess wrong.

4. **Missing gotchas section.** This is where the real value lives. If you
   can't think of gotchas, ask: "What has tripped up new developers?"

5. **Oversized root modules.** Dumping everything into the root module bloats
   every generated output. Use rule files for domain-specific guidance.

6. **Passive descriptions instead of instructions.** Context files are
   runbooks, not documentation. Tell the agent what to do.
