# Frontend Rules

Conventions for the web application and client-side code.

**Key files**: `apps/web/src/components/`, `apps/web/src/hooks/`, `apps/web/src/pages/`

## Conventions

- Use the shared API client from `lib/api.ts` — never call `fetch` directly
- Keep component files under 200 lines; split into subcomponents when needed
- Co-locate hooks with the components that use them

## Verification

- `pnpm --filter web test` — must pass after any component change
- Check responsive behavior at 375px, 768px, and 1280px breakpoints

## Gotchas

- The router uses file-based routing — component file names become URL paths
- State accessed in `useEffect` must be in the dependency array or it silently stales
- SSR hydration mismatches cause layout flicker — avoid `typeof window` checks in render
