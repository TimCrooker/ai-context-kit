import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMirrorSymlink } from "../src/skills.js";

describe("createMirrorSymlink", () => {
  let tmp: string;
  let sourceDir: string;
  let mirrorPath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-mirror-"));
    sourceDir = path.join(tmp, ".ai/skills/demo");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, "SKILL.md"),
      "---\nname: demo\ndescription: x\n---\nbody\n"
    );
    mirrorPath = path.join(tmp, ".agents/skills/demo");
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("creates a symlink pointing at the source via relative path", () => {
    createMirrorSymlink(sourceDir, mirrorPath);
    const stat = fs.lstatSync(mirrorPath);
    expect(stat.isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(mirrorPath)).toBe("../../.ai/skills/demo");
  });

  it("makes source content visible through the symlink path", () => {
    createMirrorSymlink(sourceDir, mirrorPath);
    const content = fs.readFileSync(path.join(mirrorPath, "SKILL.md"), "utf8");
    expect(content).toContain("name: demo");
  });

  it("is idempotent when the correct symlink already exists", () => {
    createMirrorSymlink(sourceDir, mirrorPath);
    expect(() => createMirrorSymlink(sourceDir, mirrorPath)).not.toThrow();
    expect(fs.readlinkSync(mirrorPath)).toBe("../../.ai/skills/demo");
  });

  it("repairs a symlink that points at the wrong target", () => {
    fs.mkdirSync(path.dirname(mirrorPath), { recursive: true });
    fs.symlinkSync("../../.ai/skills/somewhere-else", mirrorPath, "dir");
    createMirrorSymlink(sourceDir, mirrorPath);
    expect(fs.readlinkSync(mirrorPath)).toBe("../../.ai/skills/demo");
  });

  it("throws SKILL_MIRROR_CONFLICT when a real directory exists at the mirror path", () => {
    fs.mkdirSync(mirrorPath, { recursive: true });
    fs.writeFileSync(path.join(mirrorPath, "SKILL.md"), "user content");
    expect(() => createMirrorSymlink(sourceDir, mirrorPath)).toThrow(
      /Cannot create skill mirror/
    );
  });

  it("throws SKILL_MIRROR_CONFLICT when a regular file exists at the mirror path", () => {
    fs.mkdirSync(path.dirname(mirrorPath), { recursive: true });
    fs.writeFileSync(mirrorPath, "junk");
    expect(() => createMirrorSymlink(sourceDir, mirrorPath)).toThrow(
      /Cannot create skill mirror/
    );
  });
});
