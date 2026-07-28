---
"@timothycrooker/ai-context-core": minor
"@timothycrooker/ai-context-templates": patch
---

Reject module `targets` that name a non-root target instead of silently dropping the module.

`modulesBody()` is only ever called with `"root"` — scoped outputs (`apps/<pkg>/AGENTS.md`, `apps/<pkg>/CLAUDE.md`, `.claude/rules/*.md`) are composed entirely from a scope's includes. A module declaring `targets: [mobile]` passed validation, because `mobile` is a real key in `manifest.targets`, and was then discarded at render time. Its body reached no generated file and the build exited 0.

`loadModules` now fails with `AICTX_CONFIG_INVALID` and points at the fix: move the content to a rule file and add it to that scope's includes. Typo'd targets still get the distinct `unknown target` error.

The meta-skill's `authoring-modules.md` and `manifest-schema.md` documented the behavior that was never implemented (`api` → `apps/api/AGENTS.md`); both now state that `root` is the only legal module target and describe the rule-file route for package-scoped content.
