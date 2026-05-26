# Content Guide: Module vs Skill vs Rule

## Decision tree

```
Is this content relevant to ALL tasks in this repo/package?
  YES → Module (.ai/context/modules/*.md)
  NO  → Is it domain-specific knowledge needed while actively working on that domain?
          YES → Skill (.ai/skills/<name>/SKILL.md)
          NO  → Is it a Claude-specific reminder scoped to certain file paths?
                  YES → Rule (.ai/rules/*.md, referenced by a scope's claudeIncludes)
                  NO  → It probably doesn't need to exist
```

## Modules — always-present context

Use a module for facts that should be in every agent's context for every task:

- Project mission and product boundaries
- Repository structure and key package relationships
- Cross-cutting architecture constraints (type flow direction, env var access pattern)
- Commands every agent will need (`pnpm test`, `pnpm type-check`, etc.)
- Non-obvious global gotchas (things that would cause silent data loss or security issues)

**Size budget**: keep root modules under 80 lines. Every line is paid by every agent invocation.

**What modules are not**: detailed domain guides, step-by-step tutorials, reference tables for a single package. Those belong in skills or rule files.

## Skills — on-demand depth

Use a skill for knowledge that's only relevant when actively working on a specific domain:

- How to add a new Express route (only relevant when adding routes)
- Encompass API integration patterns (only relevant for LOS integration work)
- Database migration procedure (only relevant before schema changes)
- Third-party API authentication flow (only relevant for that integration)

The agent loads a skill only when it decides the skill is relevant — based on the `description` field. A well-written description is the skill's most important line.

**What skills are not**: project-wide facts (those are modules), Claude-specific path rules (those are rule files).

## Rules — Claude path-scoped reminders

Use a rule file for Claude-specific guidance scoped to a directory or file pattern:

- "When editing files under `apps/api/src/routes/`, follow REST naming convention X"
- "When in `packages/core-types/`, never add `any` — use `unknown` with a narrowing guard"
- "When touching `apps/web/src/pages/`, pages-router patterns apply (not app router)"

Rules are emitted into `.claude/rules/*.md` and wired to path globs via `claudePaths` in the scope definition. They appear in Claude's context only when the agent is working on matching files.

**What rules are not**: general project context (that's a module), capability docs (that's a skill).

---

## Common writing mistakes

### Burying the lede

The first line of a module, skill body, or rule should answer: **what is this and when does it matter?**

Bad:
```markdown
# API Module

This document covers the API layer of our application. It includes information about
routing, validation, and service patterns that developers should follow.
```

Good:
```markdown
# API Layer

Express routes → Zod validation middleware → thin controller → service. Never put
logic in controllers. All input comes from `req.validated.*` (never `req.body` directly).
```

### Conditional fluff

Every hedge weakens the context:

| Remove | Replace with |
|---|---|
| "You might want to consider..." | State the rule |
| "In most cases, you should..." | State the rule; add the exception as a gotcha |
| "It is generally recommended to..." | State the rule |
| "Depending on your use case..." | Name the cases explicitly |

### Pasting full code instead of pointing to patterns

Don't copy a 50-line service implementation into a module. Instead:

```markdown
Pattern: `apps/api/src/services/user.service.ts` — all services follow this structure.
```

If the pattern is non-obvious, show the critical 5 lines, not the full file.

### Skill descriptions without trigger keywords

A description like `"Use for API work"` is too vague. Agents match descriptions by semantic similarity — give them vocabulary to hook onto:

```yaml
description: >
  Use when adding or editing Express route handlers, controllers, or request
  validation in apps/api/. Triggers on "add endpoint", "new route", "controller",
  "zodValidate", or any file under src/routes/ or src/controllers/.
```

Include: the domain, the task type, trigger phrases, and relevant file paths.

### Modules longer than ~80 lines

If a module keeps growing, it's accumulating two things that should be separated:

1. Project-wide orientation (keep in the module, short)
2. Domain-specific detail (move to a skill or rule file)

Split by asking: "Would an agent working on a completely unrelated task need this?" If no, it doesn't belong in the root module.

### Verification sections without exact commands

```markdown
# Wrong
Run the tests after making changes.

# Right
Run `pnpm --filter @acme/api test` after any route or service change.
```

Agents run commands literally. Vague instructions produce guessed commands, which produce wrong test runs or broken CI.
