# ai-context-kit

Reusable context generation for mixed Codex + Claude workflows.

## Packages

- `@timothycrooker/ai-context-core`: generation and verification engine
- `@timothycrooker/ai-context-cli`: CLI (`ai-context`) for init/build/verify/diff/doctor
- `@timothycrooker/ai-context-templates`: starter project templates
- `@timothycrooker/ai-context-config`: shared config constants/presets

## Why

Most teams either duplicate context docs across tools or let one tool drift. This project keeps a single modular source of truth and generates tool-specific outputs with scoped, just-in-time context.

## Quickstart

```bash
pnpm add -D @timothycrooker/ai-context-cli
pnpm exec ai-context init
pnpm exec ai-context build
pnpm exec ai-context verify
```

## Contracts and Guarantees

- Stable CLI behavior and exit codes: `docs/cli-contract.md`
- Config schema and validation rules: `docs/configuration.md`
- Runtime error code catalog: `docs/error-codes.md`
- Support and versioning policy: `docs/support-policy.md`

## CLI

```bash
ai-context templates
ai-context init --template default
ai-context build
ai-context build --check
ai-context diff
ai-context verify
ai-context doctor
ai-context lint-config
```

## Production Hardening

- Deterministic generation output with normalized newlines.
- Structured `ContextError` codes for machine-readable diagnostics.
- CI matrix on Linux/macOS/Windows and Node 20/22.
- Release workflow with post-publish package visibility verification.
- Coverage thresholds enforced in `@timothycrooker/ai-context-core`.

## Repo Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

## Docs

- `docs/configuration.md`
- `docs/compatibility.md`
- `docs/troubleshooting.md`
- `docs/recipes.md`
- `docs/cli-contract.md`
- `docs/error-codes.md`
- `docs/support-policy.md`

## Publishing

This repo is configured for npm trusted publishing with GitHub Actions (`id-token: write` + provenance).  
Set up the trusted publisher in npm for `TimCrooker/ai-context-kit` before running automated releases.

## Compatibility Model

- Codex: nested `AGENTS.md` hierarchy from scope definitions.
- Claude: root `CLAUDE.md`, scoped `CLAUDE.md`, and optional path-scoped `.claude/rules/*.md`.
- Shared context stays in `.ai/context/modules/*.md` and `.ai/rules/*.md`.

## License

MIT
