import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeConsolidateSymlink } from "../src/migrate.js";
import type { MigrateEntry } from "../src/types.js";

describe("executeConsolidateSymlink", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-execcon-"));
    execSync("git init -q", { cwd: tmp });
    execSync("git config user.email test@example.com && git config user.name Test", { cwd: tmp });
    // Set up the legacy hand-symlink state: .agents/skills/pr-kickoff is the real dir, .claude/skills/pr-kickoff is a symlink
    fs.mkdirSync(path.join(tmp, ".agents/skills/pr-kickoff"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".agents/skills/pr-kickoff/SKILL.md"),
      "---\nname: pr-kickoff\ndescription: x\n---\nbody\n"
    );
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.symlinkSync("../../.agents/skills/pr-kickoff", path.join(tmp, ".claude/skills/pr-kickoff"));
    execSync("git add -A && git commit -q -m initial", { cwd: tmp });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const entry: MigrateEntry = {
    name: "pr-kickoff",
    current_state: {
      type: "existing_symlink",
      path: ".claude/skills/pr-kickoff",
      current_target: "../../.agents/skills/pr-kickoff",
      underlying_source: ".agents/skills/pr-kickoff",
    },
    action: "consolidate_symlink",
    target: {
      source: ".ai/skills/pr-kickoff",
      mirrors: [".agents/skills/pr-kickoff", ".claude/skills/pr-kickoff"],
    },
    rationale: "consolidate",
    applied_at: null,
  };

  it("moves the underlying source dir from .agents/skills/ to .ai/skills/", () => {
    executeConsolidateSymlink(tmp, entry);
    expect(fs.existsSync(path.join(tmp, ".ai/skills/pr-kickoff/SKILL.md"))).toBe(true);
  });

  it("turns .agents/skills/<name> into a symlink (was a real dir)", () => {
    executeConsolidateSymlink(tmp, entry);
    const linkPath = path.join(tmp, ".agents/skills/pr-kickoff");
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe("../../.ai/skills/pr-kickoff");
  });

  it("re-creates .claude/skills/<name> as symlink to new .ai source", () => {
    executeConsolidateSymlink(tmp, entry);
    const linkPath = path.join(tmp, ".claude/skills/pr-kickoff");
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe("../../.ai/skills/pr-kickoff");
  });

  it("makes a single git commit", () => {
    const before = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    executeConsolidateSymlink(tmp, entry);
    const after = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    expect(Number(after) - Number(before)).toBe(1);
  });
});
