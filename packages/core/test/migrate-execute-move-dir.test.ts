import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeMoveDir } from "../src/migrate.js";
import type { MigrateEntry } from "../src/types.js";

describe("executeMoveDir", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-execmv-"));
    execSync("git init -q", { cwd: tmp });
    execSync("git config user.email test@example.com", { cwd: tmp });
    execSync("git config user.name Test", { cwd: tmp });
    fs.mkdirSync(path.join(tmp, ".claude/skills/encompass-api"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".claude/skills/encompass-api/SKILL.md"),
      "---\nname: encompass-api\ndescription: x\n---\nbody\n"
    );
    execSync("git add -A && git commit -q -m initial", { cwd: tmp });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const entry: MigrateEntry = {
    name: "encompass-api",
    current_state: { type: "directory_with_skill_md", path: ".claude/skills/encompass-api" },
    action: "move_dir",
    target: {
      source: ".ai/skills/encompass-api",
      mirrors: [".agents/skills/encompass-api", ".claude/skills/encompass-api"],
    },
    rationale: "test",
    applied_at: null,
  };

  it("moves the source directory via git mv (history preserved)", () => {
    executeMoveDir(tmp, entry);
    expect(fs.existsSync(path.join(tmp, ".ai/skills/encompass-api/SKILL.md"))).toBe(true);
  });

  it("creates a symlink at .agents/skills/<name>", () => {
    executeMoveDir(tmp, entry);
    const linkPath = path.join(tmp, ".agents/skills/encompass-api");
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe("../../.ai/skills/encompass-api");
  });

  it("creates a symlink at .claude/skills/<name>", () => {
    executeMoveDir(tmp, entry);
    const linkPath = path.join(tmp, ".claude/skills/encompass-api");
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe("../../.ai/skills/encompass-api");
  });

  it("makes a single git commit per entry", () => {
    const before = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    executeMoveDir(tmp, entry);
    const after = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    expect(Number(after) - Number(before)).toBe(1);
    const lastMsg = execSync("git log -1 --pretty=%s", { cwd: tmp }).toString().trim();
    expect(lastMsg).toMatch(/migrate.*move_dir.*encompass-api/);
  });
});
