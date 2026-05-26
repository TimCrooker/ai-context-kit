import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { TemplateFile } from "@timothycrooker/ai-context-core"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function bundleBundledSkills(): TemplateFile[] {
	const skillsRoot = path.resolve(__dirname, "skills")
	if (!fs.existsSync(skillsRoot)) return []

	const files: TemplateFile[] = []

	for (const skillDir of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
		if (!skillDir.isDirectory()) continue
		const skillName = skillDir.name
		const skillRoot = path.join(skillsRoot, skillName)

		function walk(dir: string, relRoot: string): void {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const abs = path.join(dir, entry.name)
				const rel = path.join(relRoot, entry.name)
				if (entry.isDirectory()) {
					walk(abs, rel)
				} else if (entry.isFile()) {
					const content = fs.readFileSync(abs, "utf8")
					files.push({
						path: `.ai/skills/${skillName}/${rel.split(path.sep).join("/")}`,
						content,
					})
				}
			}
		}

		walk(skillRoot, "")
	}

	return files
}

// Keep the old name as an alias for backward compat
export const bundleMetaSkill = bundleBundledSkills
