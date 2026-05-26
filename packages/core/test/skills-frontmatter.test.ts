import { describe, expect, it } from "vitest";
import { parseSkillFrontmatter } from "../src/skills.js";

describe("parseSkillFrontmatter", () => {
  it("parses minimum valid frontmatter", () => {
    const raw = "---\nname: demo\ndescription: A demo skill\n---\n\n# Body\n";
    const result = parseSkillFrontmatter(raw, "demo", "/x/demo/SKILL.md");
    expect(result.name).toBe("demo");
    expect(result.description).toBe("A demo skill");
  });

  it("accepts optional fields including scope array", () => {
    const raw =
      "---\nname: api-conv\ndescription: API conventions\nscope: [api, web]\nlicense: MIT\n---\n\nbody\n";
    const result = parseSkillFrontmatter(raw, "api-conv", "/x/api-conv/SKILL.md");
    expect(result.scope).toEqual(["api", "web"]);
    expect(result.license).toBe("MIT");
  });

  it("rejects when name does not match directory name", () => {
    const raw = "---\nname: wrong\ndescription: Mismatch\n---\nbody\n";
    expect(() => parseSkillFrontmatter(raw, "demo", "/x/demo/SKILL.md")).toThrow(
      /name 'wrong' does not match directory 'demo'/
    );
  });

  it("rejects invalid name pattern", () => {
    const raw = "---\nname: Bad_Name\ndescription: x\n---\nbody\n";
    expect(() => parseSkillFrontmatter(raw, "Bad_Name", "/x/Bad_Name/SKILL.md")).toThrow(
      /invalid name pattern/
    );
  });

  it("rejects missing description", () => {
    const raw = "---\nname: demo\n---\nbody\n";
    expect(() => parseSkillFrontmatter(raw, "demo", "/x/demo/SKILL.md")).toThrow(
      /description is required/
    );
  });

  it("rejects description over 1024 chars", () => {
    const longDesc = "x".repeat(1025);
    const raw = `---\nname: demo\ndescription: ${longDesc}\n---\nbody\n`;
    expect(() => parseSkillFrontmatter(raw, "demo", "/x/demo/SKILL.md")).toThrow(
      /description.*1024/
    );
  });

  it("rejects non-string scope entries", () => {
    const raw = "---\nname: demo\ndescription: x\nscope: [1, 2]\n---\nbody\n";
    expect(() => parseSkillFrontmatter(raw, "demo", "/x/demo/SKILL.md")).toThrow(
      /scope.*string/
    );
  });
});
