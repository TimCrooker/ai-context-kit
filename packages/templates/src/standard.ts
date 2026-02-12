import type { Template } from "@timothycrooker/ai-context-core";

const MANIFEST_SCHEMA = JSON.stringify(
	{
		$schema: "https://json-schema.org/draft/2020-12/schema",
		title: "ai-context manifest",
		type: "object",
		additionalProperties: false,
		required: ["version", "modulesDir", "scopesFile", "targets"],
		properties: {
			$schema: { type: "string" },
			version: { const: 1 },
			modulesDir: { type: "string", minLength: 1 },
			scopesFile: { type: "string", minLength: 1 },
			claudeOutput: { type: "string", minLength: 1 },
			targets: {
				type: "object",
				minProperties: 1,
				required: ["root"],
				additionalProperties: {
					type: "string",
					minLength: 1,
				},
			},
		},
	},
	null,
	2,
);

const SCOPES_SCHEMA = JSON.stringify(
	{
		$schema: "https://json-schema.org/draft/2020-12/schema",
		title: "ai-context scopes",
		type: "object",
		additionalProperties: false,
		required: ["version", "scopes"],
		properties: {
			$schema: { type: "string" },
			version: { const: 1 },
			claudeRulesDir: { type: "string", minLength: 1 },
			scopes: {
				type: "array",
				minItems: 1,
				items: {
					type: "object",
					additionalProperties: false,
					required: ["id"],
					properties: {
						id: { type: "string", minLength: 1 },
						codexTarget: { type: "string", minLength: 1 },
						includes: {
							type: "array",
							minItems: 1,
							items: { type: "string", minLength: 1 },
						},
						codexIncludes: {
							type: "array",
							minItems: 1,
							items: { type: "string", minLength: 1 },
						},
						claudeIncludes: {
							type: "array",
							minItems: 1,
							items: { type: "string", minLength: 1 },
						},
						codexAgents: {
							type: "array",
							minItems: 1,
							items: { type: "string", minLength: 1 },
						},
						claudeMemories: {
							type: "array",
							minItems: 1,
							items: { type: "string", minLength: 1 },
						},
						claudeRuleFile: { type: "string", minLength: 1 },
						claudePaths: {
							type: "array",
							minItems: 1,
							items: { type: "string", minLength: 1 },
						},
						parity: { type: "boolean" },
						reason: { type: "string", minLength: 1 },
					},
				},
			},
		},
	},
	null,
	2,
);

export const STANDARD_TEMPLATE: Template = {
	name: "standard",
	files: [
		{
			path: ".ai/context/schemas/manifest.schema.json",
			content: MANIFEST_SCHEMA,
		},
		{
			path: ".ai/context/schemas/scopes.schema.json",
			content: SCOPES_SCHEMA,
		},
		{
			path: ".ai/context/manifest.json",
			content: JSON.stringify(
				{
					$schema: "./schemas/manifest.schema.json",
					version: 1,
					modulesDir: ".ai/context/modules",
					scopesFile: ".ai/context/scopes.json",
					claudeOutput: "CLAUDE.md",
					targets: {
						root: "AGENTS.md",
					},
				},
				null,
				2,
			),
		},
		{
			path: ".ai/context/scopes.json",
			content: JSON.stringify(
				{
					$schema: "./schemas/scopes.schema.json",
					version: 1,
					claudeRulesDir: ".claude/rules",
					scopes: [
						{
							id: "app",
							claudeRuleFile: "app-core.md",
							claudePaths: ["src/**"],
							claudeIncludes: [
								".ai/rules/app-core.md",
								".ai/rules/testing.md",
							],
							parity: false,
							reason:
								"Single-app project with Claude rules only",
						},
					],
				},
				null,
				2,
			),
		},
		{
			path: ".ai/context/modules/010-project-overview.md",
			content: [
				"---",
				"id: project-overview",
				"targets:",
				"  - root",
				"order: 10",
				"---",
				"# Project Overview",
				"",
				"Describe your project, its purpose, and high-level architecture here.",
				"Keep this module lean — push domain-specific rules into `.ai/rules/` files.",
				"See the [content guide](docs/content-guide.md) for writing effective context.",
			].join("\n"),
		},
		{
			path: ".ai/rules/app-core.md",
			content: [
				"# App Core Rules",
				"",
				"Core conventions for the application codebase.",
				"",
				"**Key files**: `src/`",
				"",
				"## Conventions",
				"",
				"- Use TypeScript strict mode for all source files",
				"- Prefer named exports over default exports",
				"- Keep functions under 40 lines; extract helpers when logic branches",
				"",
				"## Verification",
				"",
				"- Run `pnpm test` after any logic change",
				"- Run `pnpm typecheck` before committing",
				"",
				"## Gotchas",
				"",
				"- Environment variables are only available via `config.ts` — never read `process.env` directly",
				"- The `internal/` directory is not part of the public API — never import from it in `src/`",
			].join("\n"),
		},
		{
			path: ".ai/rules/testing.md",
			content: [
				"# Testing Rules",
				"",
				"Guidelines for writing and running tests.",
				"",
				"**Key files**: `src/**/*.test.ts`, `test/`",
				"",
				"## Conventions",
				"",
				"- Co-locate test files next to source (`foo.test.ts` beside `foo.ts`)",
				"- Use `describe`/`it` blocks with clear intent in the test name",
				"- Prefer `vi.fn()` for mocks; avoid mocking implementation details",
				"",
				"## Verification",
				"",
				"- `pnpm test` — all tests must pass",
				"- Check coverage report for untested branches after adding new logic",
				"",
				"## Gotchas",
				"",
				"- Tests run in parallel by default — never share mutable state between test files",
				"- Snapshot tests break silently on formatting changes — prefer explicit assertions",
			].join("\n"),
		},
		{
			path: ".codex/config.toml",
			content: [
				'project_root_markers = [".git"]',
				"project_doc_max_bytes = 65536",
				"",
				"[features]",
				"child_agents_md = true",
			].join("\n"),
		},
		{
			path: ".gitignore",
			content: [
				"node_modules",
				"dist",
				".DS_Store",
				"CLAUDE.local.md",
				".ai/secrets.local.env",
			].join("\n"),
		},
	],
};
