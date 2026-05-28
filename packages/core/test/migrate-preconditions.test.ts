import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkApplyPreconditions } from "../src/migrate.js";

describe("checkApplyPreconditions", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-precond-"));
    execSync("git init -q", { cwd: tmp });
    execSync("git config user.email test@example.com", { cwd: tmp });
    execSync("git config user.name Test", { cwd: tmp });
    fs.writeFileSync(path.join(tmp, ".gitignore"), "");
    execSync("git add .gitignore && git commit -q -m init", { cwd: tmp });

    fs.mkdirSync(path.join(tmp, ".ai/context"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
        skills: {
          source: ".ai/skills",
          mirrors: [".agents/skills", ".claude/skills"],
          metaSkill: true,
        },
      })
    );
    fs.mkdirSync(path.join(tmp, ".ai/context/modules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/modules/010.md"),
      "---\nid: o\ntargets: [root]\norder: 10\n---\nbody\n"
    );
    fs.writeFileSync(
      path.join(tmp, ".ai/context/scopes.json"),
      JSON.stringify({ version: 1, scopes: [] })
    );
    execSync("git add -A && git commit -q -m setup", { cwd: tmp });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("passes when git tree is clean and manifest has skills block", () => {
    expect(() => checkApplyPreconditions(tmp)).not.toThrow();
  });

  it("throws AICTX_MIGRATE_NOT_GIT_REPO when not a git repo", () => {
    fs.rmSync(path.join(tmp, ".git"), { recursive: true });
    try {
      checkApplyPreconditions(tmp);
      throw new Error("expected throw");
    } catch (e: any) {
      expect(e.code).toBe("AICTX_MIGRATE_NOT_GIT_REPO");
    }
  });

  it("throws AICTX_MIGRATE_DIRTY_TREE when there are unstaged changes", () => {
    fs.writeFileSync(path.join(tmp, "dirty.txt"), "hello");
    try {
      checkApplyPreconditions(tmp);
      throw new Error("expected throw");
    } catch (e: any) {
      expect(e.code).toBe("AICTX_MIGRATE_DIRTY_TREE");
    }
  });

  it("throws AICTX_MIGRATE_DIRTY_TREE when there are staged changes", () => {
    fs.writeFileSync(path.join(tmp, "staged.txt"), "hello");
    execSync("git add staged.txt", { cwd: tmp });
    try {
      checkApplyPreconditions(tmp);
      throw new Error("expected throw");
    } catch (e: any) {
      expect(e.code).toBe("AICTX_MIGRATE_DIRTY_TREE");
    }
  });

  it("throws AICTX_MIGRATE_NO_SKILLS_BLOCK when manifest has no skills field", () => {
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
      })
    );
    execSync("git add .ai/context/manifest.json && git commit -q -m update", { cwd: tmp });
    try {
      checkApplyPreconditions(tmp);
      throw new Error("expected throw");
    } catch (e: any) {
      expect(e.code).toBe("AICTX_MIGRATE_NO_SKILLS_BLOCK");
    }
  });
});
