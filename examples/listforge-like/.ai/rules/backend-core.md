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
