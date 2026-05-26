import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAll, diffGenerated, doctor, lintConfig, verifyAll } from "../src/engine.js";

function setup(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-verify-skills-"));
  fs.mkdirSync(path.join(tmp, ".ai/context/modules"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, ".ai/context/modules/010-overview.md"),
    "---\nid: overview\ntargets: [root]\norder: 10\n---\n\n# Overview\n"
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
    "---\nname: demo\ndescription: A demo skill\n---\n\nbody\n"
  );
  return tmp;
}

describe("skill engine integration: verify/diff/doctor/lintConfig", () => {
  let tmp: string;
  beforeEach(() => (tmp = setup()));
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("verifyAll fails when skill mirror is missing", () => {
    const result = verifyAll(tmp);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/skill|mirror/i);
  });

  it("verifyAll passes after build", () => {
    buildAll(tmp);
    const result = verifyAll(tmp);
    expect(result.ok).toBe(true);
  });

  it("diffGenerated reports missing skill mirrors as 'create'", () => {
    const report = diffGenerated(tmp);
    const skillItems = report.items.filter((i) => i.path.includes("skills/demo"));
    expect(skillItems.length).toBeGreaterThan(0);
    expect(skillItems.every((i) => i.type === "create")).toBe(true);
  });

  it("doctor reports broken skill mirrors", () => {
    buildAll(tmp);
    fs.rmSync(path.join(tmp, ".ai/skills/demo"), { recursive: true });
    const result = doctor(tmp);
    expect(result.issues.join("\n")).toMatch(/skill|broken/i);
  });

  it("lintConfig errors on undefined scope reference", () => {
    fs.writeFileSync(
      path.join(tmp, ".ai/skills/demo/SKILL.md"),
      "---\nname: demo\ndescription: x\nscope: [nonexistent]\n---\nbody\n"
    );
    const result = lintConfig(tmp);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/AICTX_SKILL_SCOPE_UNKNOWN/);
  });
});
