import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectTemplate, getTemplate, listTemplates } from "../src/index.js";

describe("listTemplates", () => {
	it("returns monorepo and standard", () => {
		expect(listTemplates()).toEqual(["monorepo", "standard"]);
	});
});

describe("getTemplate", () => {
	it("aliases default to standard", () => {
		const standard = getTemplate("standard");
		const defaultTemplate = getTemplate("default");
		expect(defaultTemplate.name).toBe(standard.name);
		expect(defaultTemplate.files.length).toBe(standard.files.length);
	});

	it("throws for unknown template", () => {
		expect(() => getTemplate("nonexistent")).toThrow("Unknown template");
	});
});

describe("detectTemplate", () => {
	it("returns standard when no monorepo markers exist", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-ctx-detect-"));
		expect(detectTemplate(tmpDir)).toBe("standard");
	});

	it("returns monorepo when turbo.json exists", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-ctx-detect-"));
		fs.writeFileSync(path.join(tmpDir, "turbo.json"), "{}", "utf8");
		expect(detectTemplate(tmpDir)).toBe("monorepo");
	});

	it("returns monorepo when turbo is in devDependencies", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-ctx-detect-"));
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify({ devDependencies: { turbo: "^2.0.0" } }),
			"utf8",
		);
		expect(detectTemplate(tmpDir)).toBe("monorepo");
	});
});

describe("standard template", () => {
	it("emits parseable manifest and scopes files", () => {
		const template = getTemplate("standard");
		const manifest = template.files.find(
			(f) => f.path === ".ai/context/manifest.json",
		);
		const scopes = template.files.find(
			(f) => f.path === ".ai/context/scopes.json",
		);

		expect(manifest).toBeDefined();
		expect(scopes).toBeDefined();

		const manifestJson = JSON.parse(manifest!.content) as Record<
			string,
			unknown
		>;
		const scopesJson = JSON.parse(scopes!.content) as Record<
			string,
			unknown
		>;

		expect(manifestJson.$schema).toBe("./schemas/manifest.schema.json");
		expect(manifestJson.version).toBe(1);
		expect(scopesJson.$schema).toBe("./schemas/scopes.schema.json");
		expect(scopesJson.version).toBe(1);
	});

	it("rule files contain Gotchas and Verification sections", () => {
		const template = getTemplate("standard");
		const rules = template.files.filter((f) =>
			f.path.startsWith(".ai/rules/"),
		);

		expect(rules.length).toBeGreaterThan(0);
		for (const file of rules) {
			expect(file.content).toContain("## Gotchas");
			expect(file.content).toContain("## Verification");
		}
	});

	it("uses real newlines in generated markdown rule files", () => {
		const template = getTemplate("standard");
		const markdownRules = template.files.filter((f) =>
			f.path.startsWith(".ai/rules/"),
		);

		expect(markdownRules.length).toBeGreaterThan(0);
		for (const file of markdownRules) {
			expect(file.content).not.toContain("\\n");
			expect(file.content).toContain("\n");
		}
	});
});

describe("monorepo template", () => {
	it("emits parseable manifest and scopes files", () => {
		const template = getTemplate("monorepo");
		const manifest = template.files.find(
			(f) => f.path === ".ai/context/manifest.json",
		);
		const scopes = template.files.find(
			(f) => f.path === ".ai/context/scopes.json",
		);

		expect(manifest).toBeDefined();
		expect(scopes).toBeDefined();

		const manifestJson = JSON.parse(manifest!.content) as Record<
			string,
			unknown
		>;
		const scopesJson = JSON.parse(scopes!.content) as Record<
			string,
			unknown
		>;

		expect(manifestJson.$schema).toBe("./schemas/manifest.schema.json");
		expect(manifestJson.version).toBe(1);
		expect(scopesJson.$schema).toBe("./schemas/scopes.schema.json");
		expect(scopesJson.version).toBe(1);
	});

	it("rule files contain Conventions, Verification, and Gotchas sections", () => {
		const template = getTemplate("monorepo");
		const rules = template.files.filter((f) =>
			f.path.startsWith(".ai/rules/"),
		);

		expect(rules.length).toBeGreaterThan(0);
		for (const file of rules) {
			expect(file.content).toContain("## Conventions");
			expect(file.content).toContain("## Verification");
			expect(file.content).toContain("## Gotchas");
		}
	});

	it("uses real newlines in generated markdown rule files", () => {
		const template = getTemplate("monorepo");
		const markdownRules = template.files.filter((f) =>
			f.path.startsWith(".ai/rules/"),
		);

		expect(markdownRules.length).toBeGreaterThan(0);
		for (const file of markdownRules) {
			expect(file.content).not.toContain("\\n");
			expect(file.content).toContain("\n");
		}
	});
});
