# Legacy bare-MD slash command conversion

Some old skills are stored as `.claude/skills/<name>.md` (a bare markdown file with no enclosing directory). The kit's migration converts them to `.ai/skills/<name>/SKILL.md` directory form.

## What the CLI does automatically

The `migrate apply` step:
1. Creates `.ai/skills/<name>/` directory
2. Moves the bare MD content into `.ai/skills/<name>/SKILL.md`
3. If the bare MD has frontmatter, preserve it
4. If the bare MD has no frontmatter, prepend:
   ```yaml
   ---
   name: <name>
   description: Migrated from legacy slash-command at .claude/skills/<name>.md.
   ---
   ```
5. Sets up `.agents/skills/<name>` and `.claude/skills/<name>` mirror symlinks

## What to check during curation

After the plan is generated but BEFORE applying:
1. Open each `promote_bare_md` entry's source file
2. Read the actual content. Is it a real skill, or is it just a slash-command shortcut?
3. If it's a real skill: leave the entry as `promote_bare_md`
4. If it's just a shortcut for a slash command (e.g., a one-line "run /foo" reference): consider whether to convert at all. You may want to:
   - Change the action to `keep_existing` and leave the bare MD as a slash command
   - Or delete the bare MD entirely if the slash command is being deprecated

## What if the description is bad

The auto-generated description "Migrated from legacy slash-command at ..." is a placeholder. After the migration applies, you (or a follow-up) should:
1. Read the SKILL.md body
2. Write a real description matching the agentskills.io spec — what the skill does and when to use it
3. Commit the update
