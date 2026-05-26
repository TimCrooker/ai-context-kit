import { describe, expect, it } from "vitest"
import { getTemplate } from "../src/index.js"

describe("templates bundle meta-skill", () => {
	for (const name of ["standard", "monorepo"]) {
		it(`${name} template includes .ai/skills/ai-context-kit/SKILL.md`, () => {
			const template = getTemplate(name)
			const skillMd = template.files.find(
				(f) => f.path === ".ai/skills/ai-context-kit/SKILL.md",
			)
			expect(skillMd).toBeDefined()
			expect(skillMd!.content).toContain("name: ai-context-kit")
		})

		it(`${name} template includes reference docs`, () => {
			const template = getTemplate(name)
			const refs = template.files.filter((f) =>
				f.path.startsWith(".ai/skills/ai-context-kit/references/"),
			)
			expect(refs.length).toBeGreaterThanOrEqual(5)
		})

		it(`${name} manifest enables skills`, () => {
			const template = getTemplate(name)
			const manifest = template.files.find(
				(f) => f.path === ".ai/context/manifest.json",
			)
			expect(manifest!.content).toContain('"skills"')
		})

		it(`${name} template includes the ai-context-migrate skill SKILL.md`, () => {
			const template = getTemplate(name)
			const skillMd = template.files.find(
				(f) => f.path === ".ai/skills/ai-context-migrate/SKILL.md"
			)
			expect(skillMd).toBeDefined()
			expect(skillMd!.content).toContain("name: ai-context-migrate")
		})

		it(`${name} template includes migration reference docs`, () => {
			const template = getTemplate(name)
			const refs = template.files.filter((f) =>
				f.path.startsWith(".ai/skills/ai-context-migrate/references/")
			)
			expect(refs.length).toBeGreaterThanOrEqual(4)
		})
	}
})
