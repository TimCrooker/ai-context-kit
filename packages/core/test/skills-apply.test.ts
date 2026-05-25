import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applySkillMirrors } from "../src/skills.js";
import type { SkillMirrorPlan } from "../src/types.js";

describe("applySkillMirrors", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-apply-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function makeSource(name: string): string {
    const dir = path.join(tmp, ".ai/skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: x\n---\nbody\n`);
    return dir;
  }

  it("creates symlinks for every plan entry", () => {
    const sourceA = makeSource("alpha");
    const sourceB = makeSource("beta");
    const plans: SkillMirrorPlan[] = [
      { source: sourceA, mirror: path.join(tmp, ".agents/skills/alpha"), mode: "symlink" },
      { source: sourceA, mirror: path.join(tmp, ".claude/skills/alpha"), mode: "symlink" },
      { source: sourceB, mirror: path.join(tmp, ".agents/skills/beta"), mode: "symlink" },
    ];
    const result = applySkillMirrors(plans, { forceCopy: false });
    expect(result.written).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    expect(fs.lstatSync(plans[0]!.mirror).isSymbolicLink()).toBe(true);
  });

  it("falls back to copy when forceCopy is true", () => {
    const source = makeSource("alpha");
    const mirror = path.join(tmp, ".agents/skills/alpha");
    const plans: SkillMirrorPlan[] = [{ source, mirror, mode: "symlink" }];
    const result = applySkillMirrors(plans, { forceCopy: true, repoRoot: tmp });
    expect(result.fallbackToCopy).toHaveLength(1);
    expect(fs.lstatSync(mirror).isSymbolicLink()).toBe(false);
    expect(fs.statSync(mirror).isDirectory()).toBe(true);
    const skillMd = fs.readFileSync(path.join(mirror, "SKILL.md"), "utf8");
    expect(skillMd).toContain("<!-- _generated:");
  });

  it("records failures with their reasons rather than throwing", () => {
    const source = makeSource("alpha");
    const mirror = path.join(tmp, ".agents/skills/alpha");
    fs.mkdirSync(mirror, { recursive: true });
    fs.writeFileSync(path.join(mirror, "user.txt"), "stuff");
    const plans: SkillMirrorPlan[] = [{ source, mirror, mode: "symlink" }];
    const result = applySkillMirrors(plans, { forceCopy: false });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.reason).toMatch(/AICTX_SKILL_MIRROR_CONFLICT/);
    expect(result.written).toHaveLength(0);
  });
});
