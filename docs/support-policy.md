# Support Policy

## Runtime Support

- Node.js: `>=20`
- pnpm: `>=9`

## Release Policy

- Semantic versioning is used for all published packages.
- Patch releases: bug fixes and non-breaking hardening.
- Minor releases: additive features and compatibility-safe enhancements.
- Major releases: breaking CLI/config/output contract changes.

## Backward Compatibility

- Root and scoped generation behavior is treated as a compatibility contract.
- Config schema version (`version: 1`) is currently required.
- Breaking config semantics require a major version increment and migration notes.

## 1.x Stability Guarantees

Starting at v1.0, the kit guarantees:

- Manifest schema additions are non-breaking (e.g., the `skills` field was added as opt-in in 1.0 without breaking 0.3.x manifests).
- Skill source format follows the [agentskills.io](https://agentskills.io) open standard, which the kit conforms to at the baseline (`name`, `description` frontmatter).
- Symlink-based mirror layout at `.agents/skills/` and `.claude/skills/` is stable for 1.x.
- CLI exit codes documented in `cli-contract.md` are stable for 1.x.

Removing or renaming an existing manifest field, scope schema field, or CLI command is a major version bump.
