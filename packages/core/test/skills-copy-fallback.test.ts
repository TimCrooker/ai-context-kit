import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMirrorCopy } from "../src/skills.js";

describe("createMirrorCopy", () => {
  let tmp: string;
  let sourceDir: string;
  let mirrorPath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-copy-"));
    sourceDir = path.join(tmp, ".ai/skills/demo");
    fs.mkdirSync(path.join(sourceDir, "references"), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, "SKILL.md"),
      "---\nname: demo\ndescription: x\n---\nbody\n"
    );
    fs.writeFileSync(path.join(sourceDir, "references/notes.md"), "notes");
    fs.writeFileSync(path.join(sourceDir, "scripts/run.sh"), "#!/bin/bash\n");
    mirrorPath = path.join(tmp, ".agents/skills/demo");
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("recursively copies the source directory tree", () => {
    createMirrorCopy(sourceDir, mirrorPath, tmp);
    expect(fs.existsSync(path.join(mirrorPath, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(mirrorPath, "references/notes.md"))).toBe(true);
    expect(fs.existsSync(path.join(mirrorPath, "scripts/run.sh"))).toBe(true);
  });

  it("prepends a _generated banner to the copied SKILL.md", () => {
    createMirrorCopy(sourceDir, mirrorPath, tmp);
    const copied = fs.readFileSync(path.join(mirrorPath, "SKILL.md"), "utf8");
    expect(copied.startsWith("<!-- _generated: do not edit here.")).toBe(true);
    expect(copied).toContain("Source: .ai/skills/demo/SKILL.md");
  });

  it("preserves the original frontmatter after the banner", () => {
    createMirrorCopy(sourceDir, mirrorPath, tmp);
    const copied = fs.readFileSync(path.join(mirrorPath, "SKILL.md"), "utf8");
    expect(copied).toContain("name: demo");
    expect(copied).toContain("description: x");
  });

  it("sets exec bit on .sh files (POSIX only)", () => {
    if (process.platform === "win32") return;
    createMirrorCopy(sourceDir, mirrorPath, tmp);
    const mode = fs.statSync(path.join(mirrorPath, "scripts/run.sh")).mode;
    expect(mode & 0o111).not.toBe(0);
  });

  it("overwrites existing copy mirror without complaint", () => {
    createMirrorCopy(sourceDir, mirrorPath, tmp);
    fs.writeFileSync(
      path.join(sourceDir, "SKILL.md"),
      "---\nname: demo\ndescription: v2\n---\nbody\n"
    );
    createMirrorCopy(sourceDir, mirrorPath, tmp);
    const copied = fs.readFileSync(path.join(mirrorPath, "SKILL.md"), "utf8");
    expect(copied).toContain("description: v2");
  });
});
