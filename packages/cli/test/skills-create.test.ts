import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliBin = path.resolve(__dirname, "../dist/index.js");

describe("ai-context skills create", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-cli-create-"));
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
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("scaffolds a new skill at .ai/skills/<name>/SKILL.md", () => {
    execSync(`node ${cliBin} skills create my-skill --description "Does a thing"`, { cwd: tmp });
    const skillMd = fs.readFileSync(
      path.join(tmp, ".ai/skills/my-skill/SKILL.md"),
      "utf8"
    );
    expect(skillMd).toContain("name: my-skill");
    expect(skillMd).toContain('description: "Does a thing"');
  });

  it("creates symlinks at both mirror paths", () => {
    execSync(`node ${cliBin} skills create my-skill --description "x"`, { cwd: tmp });
    expect(
      fs.lstatSync(path.join(tmp, ".agents/skills/my-skill")).isSymbolicLink()
    ).toBe(true);
    expect(
      fs.lstatSync(path.join(tmp, ".claude/skills/my-skill")).isSymbolicLink()
    ).toBe(true);
  });

  it("scaffolds references/ and scripts/ when flags set", () => {
    execSync(
      `node ${cliBin} skills create rich --description "x" --with-references --with-scripts`,
      { cwd: tmp }
    );
    expect(fs.existsSync(path.join(tmp, ".ai/skills/rich/references"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".ai/skills/rich/scripts"))).toBe(true);
  });

  it("errors when name is invalid", () => {
    expect(() =>
      execSync(`node ${cliBin} skills create Bad_Name --description "x"`, { cwd: tmp, stdio: "pipe" })
    ).toThrow();
  });
});
