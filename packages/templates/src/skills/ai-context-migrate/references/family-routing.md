# Family routing skills

A "family" is a set of related skills with a common prefix (e.g., `roam-api`, `roam-auth`, `roam-chat`, ...).

## The router pattern

The router skill (`roam-api`) is the ENTRY POINT. It's always-in-context (auto-loaded) and tells the agent:
- This family exists
- Which specialty skill to invoke for which task
- The conventions shared across the family (auth, error patterns, etc.)

The specialty skills (`roam-auth`, `roam-chat`, ...) load only when needed.

## When to KEEP the router pattern

- Router has clear "use roam-X for verb Y" instructions
- Specialties have substantive, non-overlapping content
- The router is small (under 200 lines); each specialty is also bounded

## When to COLLAPSE the family

- Only one specialty exists (no real family yet) — collapse into the router
- The router is huge (>500 lines) and the specialties are stubs — consolidate
- The router and specialties say the same things — unify

## Factoring shared content

When 3+ specialties in the same family share a common section (e.g., auth setup, error retry pattern):

1. Extract that section into a new skill named `<family>-_shared.md` OR into a sibling references/ doc inside the router skill
2. Update each specialty to LINK to the shared content rather than restate it
3. Add an entry to the migration plan if this happens during migration

Don't be overly aggressive. A repeated 5-line section is fine to leave as-is.
