import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliBin = path.resolve(__dirname, "../dist/index.js");

describe("ai-context migrate plan", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-cli-mplan-"));
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
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("creates a migration plan file with the expected entries", () => {
    execSync(`node ${cliBin} migrate plan`, { cwd: tmp });
    const planPath = path.join(tmp, ".ai/migration-plan.json");
    expect(fs.existsSync(planPath)).toBe(true);
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    expect(plan.summary.total_entries_found).toBe(1);
    expect(plan.entries[0].name).toBe("demo");
  });

  it("prints a summary to stdout", () => {
    const out = execSync(`node ${cliBin} migrate plan`, { cwd: tmp }).toString();
    expect(out).toMatch(/1 entry|move_dir.*1/);
  });

  it("refuses to overwrite without --force", () => {
    execSync(`node ${cliBin} migrate plan`, { cwd: tmp });
    expect(() => execSync(`node ${cliBin} migrate plan`, { cwd: tmp, stdio: "pipe" })).toThrow();
  });

  it("allows overwriting with --force", () => {
    execSync(`node ${cliBin} migrate plan`, { cwd: tmp });
    expect(() => execSync(`node ${cliBin} migrate plan --force`, { cwd: tmp })).not.toThrow();
  });
});
