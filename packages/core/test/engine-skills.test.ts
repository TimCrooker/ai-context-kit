import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAll } from "../src/engine.js";

describe("buildAll with skills", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-engine-skills-"));
    fs.mkdirSync(path.join(tmp, ".ai/context"), { recursive: true });
    fs.mkdirSync(path.join(tmp, ".ai/context/modules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/modules/010-overview.md"),
      "---\nid: overview\ntargets: [root]\norder: 10\n---\n\n# Overview\n\nSome content.\n"
    );
    fs.writeFileSync(
      path.join(tmp, ".ai/context/scopes.json"),
      JSON.stringify({ version: 1, scopes: [] })
    );
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
        skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"] },
      })
    );
    fs.mkdirSync(path.join(tmp, ".ai/skills/demo"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/skills/demo/SKILL.md"),
      "---\nname: demo\ndescription: A demo\n---\n\n# Demo\n"
    );
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("creates skill mirrors during build", () => {
    buildAll(tmp);
    expect(fs.lstatSync(path.join(tmp, ".agents/skills/demo")).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(tmp, ".claude/skills/demo")).isSymbolicLink()).toBe(true);
  });

  it("skipping skills entirely when manifest.skills is absent", () => {
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
      })
    );
    buildAll(tmp);
    expect(fs.existsSync(path.join(tmp, ".agents/skills/demo"))).toBe(false);
    expect(fs.existsSync(path.join(tmp, ".claude/skills/demo"))).toBe(false);
  });

  it("removes orphaned mirrors with --remove-orphans flag", () => {
    buildAll(tmp);
    fs.rmSync(path.join(tmp, ".ai/skills/demo"), { recursive: true });
    buildAll(tmp, { removeOrphans: true });
    expect(fs.existsSync(path.join(tmp, ".agents/skills/demo"))).toBe(false);
  });

  it("--check fails when source exists but mirror is missing", () => {
    // First a real build creates the mirrors
    buildAll(tmp);
    expect(fs.existsSync(path.join(tmp, ".agents/skills/demo"))).toBe(true);
    // Check mode on an up-to-date tree is fine
    expect(() => buildAll(tmp, { check: true })).not.toThrow();
    // Remove one mirror and verify check detects it
    fs.rmSync(path.join(tmp, ".agents/skills/demo"), { recursive: true, force: true });
    const result = buildAll(tmp, { check: true });
    expect(result.upToDate).toBe(false);
  });
});
