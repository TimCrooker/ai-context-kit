---
"@ai-context-kit/core": patch
---

Point generated Claude notes at skills instead of path-glob rules

The generated `CLAUDE.md` advised reserving `.claude/rules/*.md` for narrow
path-glob injections. In practice the durable pattern is a skill holding the
procedure plus a scoped `CLAUDE.md` that points at it, which loads where the
work happens without the rule mechanism. The note now says that.

Also drops "rule file" from the module-target error message, which steered
readers to the same mechanism while explaining an unrelated config mistake.
