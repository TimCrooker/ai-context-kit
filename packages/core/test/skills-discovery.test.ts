import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverSkills } from "../src/skills.js";

describe("discoverSkills", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-skills-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function writeSkill(name: string, frontmatter: string): void {
    const dir = path.join(tmp, ".ai/skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\n${frontmatter}\n---\n\nbody\n`,
      "utf8"
    );
  }

  it("returns empty list when source dir does not exist", () => {
    const skills = discoverSkills(tmp, ".ai/skills");
    expect(skills).toEqual([]);
  });

  it("discovers skills with SKILL.md files", () => {
    writeSkill("alpha", "name: alpha\ndescription: First");
    writeSkill("beta", "name: beta\ndescription: Second");

    const skills = discoverSkills(tmp, ".ai/skills");
    expect(skills.map((s) => s.name).sort()).toEqual(["alpha", "beta"]);
    expect(skills[0]!.dir).toBe(path.join(tmp, ".ai/skills/alpha"));
    expect(skills[0]!.skillMdPath).toBe(path.join(tmp, ".ai/skills/alpha/SKILL.md"));
    expect(skills[0]!.frontmatter.description).toBe("First");
  });

  it("errors when a skill directory lacks SKILL.md", () => {
    fs.mkdirSync(path.join(tmp, ".ai/skills/incomplete"), { recursive: true });
    expect(() => discoverSkills(tmp, ".ai/skills")).toThrow(/SKILL\.md not found/);
  });

  it("propagates frontmatter validation errors with file context", () => {
    writeSkill("invalid", "name: wrong\ndescription: x");
    expect(() => discoverSkills(tmp, ".ai/skills")).toThrow(
      /does not match directory 'invalid'/
    );
  });

  it("ignores hidden directories like .DS_Store-style", () => {
    fs.mkdirSync(path.join(tmp, ".ai/skills/.hidden"), { recursive: true });
    writeSkill("visible", "name: visible\ndescription: x");
    const skills = discoverSkills(tmp, ".ai/skills");
    expect(skills.map((s) => s.name)).toEqual(["visible"]);
  });

  it("does not recurse into nested directories beyond depth 1", () => {
    writeSkill("alpha", "name: alpha\ndescription: x");
    const nested = path.join(tmp, ".ai/skills/alpha/references/sub");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, "SKILL.md"),
      "---\nname: sub\ndescription: y\n---\nbody\n",
      "utf8"
    );
    const skills = discoverSkills(tmp, ".ai/skills");
    expect(skills.map((s) => s.name)).toEqual(["alpha"]);
  });
});
