import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliBin = path.resolve(__dirname, "../dist/index.js");

describe("ai-context skills list", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-cli-list-"));
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
      "---\nname: demo\ndescription: A demo skill\n---\nbody\n"
    );
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("lists skills with their descriptions", () => {
    execSync(`node ${cliBin} build`, { cwd: tmp });
    const output = execSync(`node ${cliBin} skills list`, { cwd: tmp }).toString();
    expect(output).toContain("demo");
    expect(output).toContain("A demo skill");
  });

  it("emits JSON with --json", () => {
    execSync(`node ${cliBin} build`, { cwd: tmp });
    const output = execSync(`node ${cliBin} skills list --json`, { cwd: tmp }).toString();
    const parsed = JSON.parse(output);
    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0].name).toBe("demo");
  });
});
