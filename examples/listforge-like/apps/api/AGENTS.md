<!--
  GENERATED FILE: Do not edit directly.
  Source: .ai/context/scopes.json
  Build: ai-context build
-->
# Scoped Agent Context (Generated)

This file is generated from `.ai/context/scopes.json` by `ai-context build`.
Edit scope definitions and re-run the build instead of editing this file directly.

## Scope: api

<!-- Source: .ai/rules/backend-core.md -->
# Backend Rules

Conventions for the API layer and backend services.

**Key files**: `apps/api/src/routes/`, `apps/api/src/services/`

## Conventions

- Keep endpoints thin — extract business logic into service files
- Use Zod schemas for all request and response validation
- Name service files `<entity>.service.ts`
- Return typed error responses, never throw raw HTTP status codes

## Verification

- `pnpm --filter api test` — must pass after any route or service change
- `pnpm typecheck` — zero errors required

## Gotchas

- The auth middleware sets `req.tenantId` from the JWT — never read tenant from the request body
- `DELETE` endpoints use soft-delete by default — pass `{ hard: true }` only for GDPR purges
- Rate limiting is per-IP in development but per-tenant in production

<!-- Source: .ai/rules/security-core.md -->
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
