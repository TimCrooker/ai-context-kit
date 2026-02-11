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
