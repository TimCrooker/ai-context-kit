# Security Rules

Security constraints that apply across the entire codebase.

**Key files**: `apps/api/src/middleware/auth.ts`, `apps/api/src/middleware/rate-limit.ts`

## Conventions

- All API endpoints require authentication unless explicitly allowlisted
- Use parameterized queries for all database access — never interpolate user input
- Sanitize HTML output to prevent XSS — use the shared `sanitize()` helper

## Verification

- Review all new endpoints for auth middleware usage
- Run `pnpm audit` after adding or updating dependencies
- Check that no secrets appear in client-side bundles

## Gotchas

- Tenant identifiers must come from the auth middleware — never trust body or query params
- The `admin` role bypasses row-level security — test admin and non-admin paths separately
- CORS is configured per-environment — the dev config allows `localhost:*` which production must not
