<!--
  GENERATED FILE: Do not edit directly.
  Source: .ai/context/scopes.json
  Build: ai-context build
-->
# Scoped Claude Instructions

This file is generated from `.ai/context/scopes.json` by `ai-context build`.
Edit scope definitions and re-run the build instead of editing this file directly.

## Scope: web

<!-- Source: .ai/rules/frontend-core.md -->
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

<!-- Source: .ai/rules/ui-core.md -->
# UI Rules

Design system and visual consistency rules.

**Key files**: `apps/web/src/components/ui/`, `apps/web/src/styles/`

## Conventions

- Use shared UI primitives from `components/ui/` — never create one-off styled elements
- Follow the spacing scale: 4px, 8px, 12px, 16px, 24px, 32px, 48px
- Use semantic color tokens (`--color-primary`, `--color-danger`) not raw hex values

## Verification

- Visual review at light and dark theme variants
- Run accessibility linter on new components
- Check that touch targets are at least 44x44px on mobile

## Gotchas

- The design system uses CSS custom properties — Tailwind `@apply` does not resolve them
- Icon components are tree-shaken — import individual icons, not the barrel export
- Z-index values above 50 conflict with the modal overlay — use the `z-index` scale in `tokens.css`
