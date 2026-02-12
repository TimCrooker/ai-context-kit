import path from "node:path";
import { exists, readUtf8 } from "./io.js";
import { resolveScopeIncludes } from "./config.js";
import { toPosix } from "./path-utils.js";
import type { ContextModule, Manifest, ScopeManifest } from "./types.js";

export interface ContentLintResult {
	suggestions: string[];
}

const PLACEHOLDER_PATTERN = /\b(TODO|FIXME|PLACEHOLDER|XXX)\b/i;

export function lintContent(
	cwd: string,
	manifest: Manifest,
	scopeManifest: ScopeManifest,
	modules: ContextModule[],
): ContentLintResult {
	const suggestions: string[] = [];
	const lintedPaths = new Set<string>();

	// Collect all rule file paths from scope includes
	for (const scope of scopeManifest.scopes) {
		const claudeIncludes = resolveScopeIncludes(scope, "claude");
		const codexIncludes = resolveScopeIncludes(scope, "codex");
		const allIncludes = new Set([...claudeIncludes, ...codexIncludes]);

		for (const includePath of allIncludes) {
			if (lintedPaths.has(includePath)) continue;
			lintedPaths.add(includePath);

			const abs = path.join(cwd, includePath);
			if (!exists(abs)) continue;

			const content = readUtf8(abs);
			const posixPath = toPosix(includePath);

			// Check for missing Gotchas section
			if (!content.includes("## Gotchas")) {
				suggestions.push(
					`${posixPath}: missing ## Gotchas section — gotchas prevent the most common agent mistakes`,
				);
			}

			// Check for missing Verification section
			if (!content.includes("## Verification")) {
				suggestions.push(
					`${posixPath}: missing ## Verification section — agents need explicit commands to validate changes`,
				);
			}

			// Check for thin content (< 5 non-blank, non-heading lines)
			const contentLines = content
				.split("\n")
				.filter((line) => {
					const trimmed = line.trim();
					return trimmed.length > 0 && !trimmed.startsWith("#");
				});
			if (contentLines.length < 5) {
				suggestions.push(
					`${posixPath}: thin content (${contentLines.length} substantive lines) — add conventions, verification commands, and gotchas`,
				);
			}

			// Check for placeholder markers
			if (PLACEHOLDER_PATTERN.test(content)) {
				suggestions.push(
					`${posixPath}: contains placeholder markers (TODO/FIXME) — fill in real content or remove`,
				);
			}
		}
	}

	// Check root-targeted modules for size
	for (const mod of modules) {
		if (!mod.targets.includes("root")) continue;

		const lineCount = mod.body.split("\n").length;
		if (lineCount > 80) {
			suggestions.push(
				`${toPosix(mod.sourcePath)}: root module has ${lineCount} lines (recommended max: 80) — move domain details to rule files`,
			);
		}
	}

	return { suggestions };
}
