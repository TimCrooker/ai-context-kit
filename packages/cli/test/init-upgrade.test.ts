import { execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const cliBin = path.resolve(__dirname, "../dist/index.js")

describe("ai-context init --upgrade", () => {
	let tmp: string
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-init-upgrade-"))
	})
	afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

	it("does not overwrite existing files", () => {
		fs.mkdirSync(path.join(tmp, ".ai/context"), { recursive: true })
		const customManifest = JSON.stringify({
			version: 1,
			modulesDir: ".ai/context/modules",
			scopesFile: ".ai/context/scopes.json",
			targets: { root: "AGENTS.md" },
		})
		fs.writeFileSync(path.join(tmp, ".ai/context/manifest.json"), customManifest)
		execSync(`node ${cliBin} init --upgrade --template standard`, { cwd: tmp })
		const manifest = JSON.parse(
			fs.readFileSync(path.join(tmp, ".ai/context/manifest.json"), "utf8"),
		) as Record<string, unknown>
		// Manifest is preserved (not overwritten)
		expect((manifest.targets as Record<string, unknown>).root).toBe("AGENTS.md")
		// Custom manifest has no skills block — it stays absent
		expect(manifest.skills).toBeUndefined()
	})

	it("seeds .ai/skills/ai-context-kit/ on a previously skill-less repo", () => {
		fs.mkdirSync(path.join(tmp, ".ai/context"), { recursive: true })
		fs.writeFileSync(
			path.join(tmp, ".ai/context/manifest.json"),
			JSON.stringify({
				version: 1,
				modulesDir: ".ai/context/modules",
				scopesFile: ".ai/context/scopes.json",
				targets: { root: "AGENTS.md" },
			}),
		)
		execSync(`node ${cliBin} init --upgrade --template standard`, { cwd: tmp })
		expect(fs.existsSync(path.join(tmp, ".ai/skills/ai-context-kit/SKILL.md"))).toBe(true)
	})
})
