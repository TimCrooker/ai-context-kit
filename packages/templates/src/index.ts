import fs from "node:fs";
import path from "node:path";
import type { Template } from "@timothycrooker/ai-context-core";
import { STANDARD_TEMPLATE } from "./standard.js";
import { MONOREPO_TEMPLATE } from "./monorepo.js";

const templates: Record<string, Template> = {
	standard: STANDARD_TEMPLATE,
	monorepo: MONOREPO_TEMPLATE,
};

export function listTemplates(): string[] {
	return Object.keys(templates).sort((a, b) => a.localeCompare(b));
}

export function getTemplate(name = "standard"): Template {
	const resolved = name === "default" ? "standard" : name;
	const template = templates[resolved];
	if (!template) {
		throw new Error(
			`Unknown template '${resolved}'. Available templates: ${listTemplates().join(", ")}`,
		);
	}
	return template;
}

export function detectTemplate(cwd: string): string {
	if (fs.existsSync(path.join(cwd, "turbo.json"))) {
		return "monorepo";
	}

	const pkgPath = path.join(cwd, "package.json");
	if (fs.existsSync(pkgPath)) {
		try {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<
				string,
				unknown
			>;
			const devDeps = pkg.devDependencies as
				| Record<string, unknown>
				| undefined;
			if (devDeps && "turbo" in devDeps) {
				return "monorepo";
			}
		} catch {
			// ignore parse errors — fall through to default
		}
	}

	return "standard";
}
