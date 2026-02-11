# ai-context-kit

Reusable context generation for mixed Codex + Claude workflows.

## Packages

- `@timcrooker/ai-context-core`: generation and verification engine
- `@timcrooker/ai-context-cli`: CLI (`ai-context`) for init/build/verify/diff/doctor
- `@timcrooker/ai-context-templates`: starter project templates
- `@timcrooker/ai-context-config`: shared config constants/presets

## Why

Most teams either duplicate context docs across tools or let one tool drift. This project keeps a single modular source of truth and generates tool-specific outputs with scoped, just-in-time context.

## Quickstart

```bash
pnpm add -D @timcrooker/ai-context-cli
pnpm exec ai-context init
pnpm exec ai-context build
pnpm exec ai-context verify
```

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

## Repo Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

## Compatibility Model

- Codex: nested `AGENTS.md` hierarchy from scope definitions.
- Claude: root `CLAUDE.md`, scoped `CLAUDE.md`, and optional path-scoped `.claude/rules/*.md`.
- Shared context stays in `.ai/context/modules/*.md` and `.ai/rules/*.md`.

## License

MIT
