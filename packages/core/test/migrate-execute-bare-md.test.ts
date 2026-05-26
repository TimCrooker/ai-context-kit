import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executePromoteBareMd } from "../src/migrate.js";
import type { MigrateEntry } from "../src/types.js";

describe("executePromoteBareMd", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-execbare-"));
    execSync("git init -q", { cwd: tmp });
    execSync("git config user.email test@example.com && git config user.name Test", { cwd: tmp });
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".claude/skills/worktree.md"),
      "# Worktree slash command\n\nDoes worktree stuff.\n"
    );
    execSync("git add -A && git commit -q -m initial", { cwd: tmp });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const entry: MigrateEntry = {
    name: "worktree",
    current_state: { type: "bare_md", path: ".claude/skills/worktree.md" },
    action: "promote_bare_md",
    target: {
      source: ".ai/skills/worktree",
      mirrors: [".agents/skills/worktree", ".claude/skills/worktree"],
    },
    rationale: "promote bare md",
    applied_at: null,
  };

  it("moves the bare MD file to the new SKILL.md location", () => {
    executePromoteBareMd(tmp, entry);
    const newPath = path.join(tmp, ".ai/skills/worktree/SKILL.md");
    expect(fs.existsSync(newPath)).toBe(true);
    const content = fs.readFileSync(newPath, "utf8");
    expect(content).toContain("Does worktree stuff");
  });

  it("removes the original bare MD path", () => {
    executePromoteBareMd(tmp, entry);
    expect(fs.existsSync(path.join(tmp, ".claude/skills/worktree.md"))).toBe(false);
  });

  it("creates both mirror symlinks", () => {
    executePromoteBareMd(tmp, entry);
    expect(fs.lstatSync(path.join(tmp, ".agents/skills/worktree")).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(tmp, ".claude/skills/worktree")).isSymbolicLink()).toBe(true);
  });

  it("adds proper frontmatter to the promoted SKILL.md if missing", () => {
    executePromoteBareMd(tmp, entry);
    const content = fs.readFileSync(path.join(tmp, ".ai/skills/worktree/SKILL.md"), "utf8");
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("name: worktree");
  });

  it("preserves existing frontmatter if present in the bare MD", () => {
    fs.writeFileSync(
      path.join(tmp, ".claude/skills/worktree.md"),
      "---\nname: worktree\ndescription: orig\n---\n\nbody\n"
    );
    execSync("git add -A && git commit -q -m amend", { cwd: tmp });
    executePromoteBareMd(tmp, entry);
    const content = fs.readFileSync(path.join(tmp, ".ai/skills/worktree/SKILL.md"), "utf8");
    expect(content).toContain("description: orig");
  });

  it("makes a single git commit", () => {
    const before = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    executePromoteBareMd(tmp, entry);
    const after = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    expect(Number(after) - Number(before)).toBe(1);
  });
});
