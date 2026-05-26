import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { TemplateFile } from "@timothycrooker/ai-context-core"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function bundleMetaSkill(): TemplateFile[] {
	const root = path.resolve(__dirname, "skills/ai-context-kit")
	const files: TemplateFile[] = []

	function walk(dir: string, relRoot: string): void {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const abs = path.join(dir, entry.name)
			const rel = path.join(relRoot, entry.name)
			if (entry.isDirectory()) {
				walk(abs, rel)
			} else if (entry.isFile()) {
				const content = fs.readFileSync(abs, "utf8")
				files.push({
					path: `.ai/skills/ai-context-kit/${rel.split(path.sep).join("/")}`,
					content,
				})
			}
		}
	}

	walk(root, "")
	return files
}
