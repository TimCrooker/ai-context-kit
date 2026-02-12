import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lintContent, loadManifest, loadModules, loadScopeManifest } from "../src/index.js";
import { copyFixture } from "./helpers.js";

function loadFixtureContext(cwd: string) {
	const manifest = loadManifest(cwd);
	const scopeManifest = loadScopeManifest(cwd, manifest);
	const modules = loadModules(cwd, manifest);
	return { manifest, scopeManifest, modules };
}

describe("content lint", () => {
	it("returns no suggestions for well-structured fixture", () => {
		const cwd = copyFixture();
		const { manifest, scopeManifest, modules } = loadFixtureContext(cwd);
		const result = lintContent(cwd, manifest, scopeManifest, modules);
		expect(result.suggestions).toEqual([]);
	});

	it("flags missing Gotchas section", () => {
		const cwd = copyFixture();
		// Strip Gotchas from one rule file
		const rulePath = path.join(cwd, ".ai/rules/backend-core.md");
		const content = fs.readFileSync(rulePath, "utf8");
		const stripped = content.replace(/## Gotchas[\s\S]*$/, "");
		fs.writeFileSync(rulePath, stripped, "utf8");

		const { manifest, scopeManifest, modules } = loadFixtureContext(cwd);
		const result = lintContent(cwd, manifest, scopeManifest, modules);
		expect(result.suggestions).toEqual(
			expect.arrayContaining([expect.stringContaining("missing ## Gotchas")]),
		);
	});

	it("flags missing Verification section", () => {
		const cwd = copyFixture();
		const rulePath = path.join(cwd, ".ai/rules/frontend-core.md");
		const content = fs.readFileSync(rulePath, "utf8");
		const stripped = content.replace(/## Verification[\s\S]*?(## |$)/, "$1");
		fs.writeFileSync(rulePath, stripped, "utf8");

		const { manifest, scopeManifest, modules } = loadFixtureContext(cwd);
		const result = lintContent(cwd, manifest, scopeManifest, modules);
		expect(result.suggestions).toEqual(
			expect.arrayContaining([
				expect.stringContaining("missing ## Verification"),
			]),
		);
	});

	it("flags thin rule files", () => {
		const cwd = copyFixture();
		const rulePath = path.join(cwd, ".ai/rules/backend-core.md");
		fs.writeFileSync(rulePath, "# Backend Rules\n\n- One rule.\n", "utf8");

		const { manifest, scopeManifest, modules } = loadFixtureContext(cwd);
		const result = lintContent(cwd, manifest, scopeManifest, modules);
		expect(result.suggestions).toEqual(
			expect.arrayContaining([expect.stringContaining("thin content")]),
		);
	});

	it("flags placeholder markers", () => {
		const cwd = copyFixture();
		const rulePath = path.join(cwd, ".ai/rules/security-core.md");
		const content = fs.readFileSync(rulePath, "utf8");
		fs.writeFileSync(
			rulePath,
			content + "\n\n<!-- TODO: add more rules -->\n",
			"utf8",
		);

		const { manifest, scopeManifest, modules } = loadFixtureContext(cwd);
		const result = lintContent(cwd, manifest, scopeManifest, modules);
		expect(result.suggestions).toEqual(
			expect.arrayContaining([
				expect.stringContaining("placeholder markers"),
			]),
		);
	});

	it("flags oversized root modules", () => {
		const cwd = copyFixture();
		const modulePath = path.join(
			cwd,
			".ai/context/modules/010-context-system.md",
		);
		const lines = [
			"---",
			"id: context-system",
			"targets:",
			"  - root",
			"order: 10",
			"---",
			"# Context System",
			"",
		];
		// Add 100 content lines to push body well over 80
		for (let i = 0; i < 100; i++) {
			lines.push(`Line ${i + 1} of context system documentation.`);
		}
		fs.writeFileSync(modulePath, lines.join("\n"), "utf8");

		const { manifest, scopeManifest, modules } = loadFixtureContext(cwd);
		const result = lintContent(cwd, manifest, scopeManifest, modules);
		expect(result.suggestions).toEqual(
			expect.arrayContaining([expect.stringContaining("root module has")]),
		);
	});
});
