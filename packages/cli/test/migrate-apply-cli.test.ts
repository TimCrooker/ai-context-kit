import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliBin = path.resolve(__dirname, "../dist/index.js");

describe("ai-context migrate apply", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-cli-mapply-"));
    execSync("git init -q", { cwd: tmp });
    execSync("git config user.email test@example.com && git config user.name Test", { cwd: tmp });
    fs.mkdirSync(path.join(tmp, ".ai/context/modules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/modules/010.md"),
      "---\nid: overview\ntargets: [root]\norder: 10\n---\n\nbody\n"
    );
    fs.writeFileSync(path.join(tmp, ".ai/context/scopes.json"), JSON.stringify({ version: 1, scopes: [] }));
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
        skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"], metaSkill: true },
      })
    );
    fs.mkdirSync(path.join(tmp, ".claude/skills/demo"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".claude/skills/demo/SKILL.md"),
      "---\nname: demo\ndescription: x\n---\nbody\n"
    );
    execSync("git add -A && git commit -q -m initial", { cwd: tmp });
    execSync(`node ${cliBin} migrate plan`, { cwd: tmp });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("executes the plan and creates symlinks", () => {
    execSync(`node ${cliBin} migrate apply`, { cwd: tmp });
    expect(fs.existsSync(path.join(tmp, ".ai/skills/demo/SKILL.md"))).toBe(true);
    expect(fs.lstatSync(path.join(tmp, ".agents/skills/demo")).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(tmp, ".claude/skills/demo")).isSymbolicLink()).toBe(true);
  });

  it("--dry-run does not modify any files", () => {
    execSync(`node ${cliBin} migrate apply --dry-run`, { cwd: tmp });
    expect(fs.existsSync(path.join(tmp, ".ai/skills/demo"))).toBe(false);
  });

  it("exits non-zero when git tree is dirty", () => {
    fs.writeFileSync(path.join(tmp, "dirty.txt"), "x");
    expect(() => execSync(`node ${cliBin} migrate apply`, { cwd: tmp, stdio: "pipe" })).toThrow();
  });
});
