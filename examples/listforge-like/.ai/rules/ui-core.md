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
