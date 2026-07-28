---
"@timothycrooker/ai-context-cli": patch
---

Require `ai-context-core@^1.4.0`, the release that rejects non-root module targets instead of silently dropping the module.

The old `^1.3.0` range admits 1.4.0, so a fresh install already picked up the fix — but an existing lockfile stays pinned to 1.3.0 and keeps the silent-drop behavior with no signal that anything is stale. `pnpm update` will not move a transitive-only dependency, so consumers had no ordinary upgrade path short of a manual override. Bumping the CLI gives them one: upgrading the package they actually depend on now pulls the fixed core.

Templates raised to `^1.1.3` for the same reason — that release carries the corrected meta-skill docs, which previously documented module `targets` behavior that was never implemented.
