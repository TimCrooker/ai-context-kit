# Overlap detection heuristics

When auditing a migration plan, look for these signals of redundancy.

## Strong signals (act on)

1. **Bare-MD + directory form with same root name**
   - `.claude/skills/foo.md` AND `.claude/skills/foo/SKILL.md` exist
   - Action: pick the directory form (it's the new standard), drop the bare-MD
   - Add the bare-MD's unique content to the directory form's SKILL.md if anything new
   - In the plan: change the bare-MD entry's action from `promote_bare_md` to `keep_existing` and add a note "consolidated into directory form"

2. **Identical `description:` frontmatter across multiple skills**
   - Two or more skills have the EXACT same description field
   - Indicates copy-paste; usually one is the original and the others are dead branches
   - Action: examine each, keep the most recently-modified or content-rich one
   - In the plan: change duplicates to `keep_existing` with rationale "duplicate of <other>"

3. **Sibling skills sharing 60%+ of section headers**
   - Use `grep -h "^## " skill1/SKILL.md skill2/SKILL.md | sort | uniq -d | wc -l` style analysis
   - If >60% of section headers are identical and the content under them is also similar, factor shared content into a `references/family-shared.md`
   - In the plan: don't change actions, but ADD a new entry creating the shared reference

## Weak signals (investigate but usually keep both)

4. **Same family prefix (e.g., `roam-*`, `graph-*`)**
   - These are usually INTENTIONAL — one router skill + N specialty skills
   - Don't collapse unless you've read both and they really do duplicate
   - The router pattern (see `family-routing.md`) is a deliberate optimization

5. **Cross-family methodology echoes**
   - `encompass-probing`, `roam-probing`, `graph-probing` all describe the same probing workflow specialized per API
   - If a `*-methodology` skill already exists (like `api-probing-methodology`), point the per-family probing skills at it via reference link
   - Don't delete the per-family skills; they have API-specific content

## How to update the plan

To mark an entry for non-migration (because it's a duplicate):
```json
{
  "name": "duplicate-foo",
  "action": "keep_existing",
  "rationale": "Duplicate of foo; deleted as part of curation. See review note."
}
```

Then in `apply`, the entry is a no-op. After apply, manually `git rm` the duplicate (the migration tool doesn't delete; that's intentional safety).

To add a NEW entry creating a shared reference:
```json
{
  "name": "_family-shared-roam",
  "action": "REVIEW",
  "rationale": "Curation-added: factor shared roam-* preamble into .ai/skills/_family-shared-roam/. Manual creation required."
}
```

`_`-prefixed entries are treated as REVIEW (the CLI doesn't know how to create new content from thin air).
