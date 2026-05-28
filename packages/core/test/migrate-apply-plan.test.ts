import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateMigrationPlan, writePlan, applyPlan, readPlan } from "../src/migrate.js";

function setupRepo(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-applyplan-"));
  execSync("git init -q", { cwd: tmp });
  execSync("git config user.email test@example.com && git config user.name Test", { cwd: tmp });

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
      skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"], metaSkill: true },
    })
  );

  // Legacy skills
  fs.mkdirSync(path.join(tmp, ".claude/skills/alpha"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, ".claude/skills/alpha/SKILL.md"),
    "---\nname: alpha\ndescription: x\n---\nbody\n"
  );
  fs.writeFileSync(path.join(tmp, ".claude/skills/legacy.md"), "# legacy\n");

  execSync("git add -A && git commit -q -m initial", { cwd: tmp });
  return tmp;
}

describe("applyPlan", () => {
  let tmp: string;
  beforeEach(() => { tmp = setupRepo(); });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("executes a 2-entry plan and updates applied_at timestamps", () => {
    const plan = generateMigrationPlan(tmp);
    writePlan(tmp, plan);
    applyPlan(tmp);

    expect(fs.existsSync(path.join(tmp, ".ai/skills/alpha/SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".ai/skills/legacy/SKILL.md"))).toBe(true);
    expect(fs.lstatSync(path.join(tmp, ".agents/skills/alpha")).isSymbolicLink()).toBe(true);

    const updatedPlan = readPlan(tmp);
    expect(updatedPlan.summary.applied).toBe(true);
    for (const e of updatedPlan.entries) {
      expect(e.applied_at).not.toBeNull();
    }
  });

  it("skips entries that already have applied_at set", () => {
    const plan = generateMigrationPlan(tmp);
    // Pre-mark alpha as applied
    plan.entries.find((e) => e.name === "alpha")!.applied_at = "2026-01-01T00:00:00.000Z";
    writePlan(tmp, plan);

    const beforeCount = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    applyPlan(tmp);
    const afterCount = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();

    // Only legacy.md should have been migrated (alpha was skipped); 1 commit added
    expect(Number(afterCount) - Number(beforeCount)).toBe(1);
  });

  it("--dry-run mode does not modify any files or commit", () => {
    const plan = generateMigrationPlan(tmp);
    writePlan(tmp, plan);
    const beforeCount = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();

    applyPlan(tmp, { dryRun: true });

    const afterCount = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    expect(beforeCount).toBe(afterCount);
    expect(fs.existsSync(path.join(tmp, ".ai/skills/alpha"))).toBe(false);
  });

  it("returns a report with per-entry status", () => {
    const plan = generateMigrationPlan(tmp);
    writePlan(tmp, plan);
    const report = applyPlan(tmp);
    expect(report.applied).toHaveLength(2);
    expect(report.skipped).toHaveLength(0);
    expect(report.failed).toHaveLength(0);
  });

  it("throws AICTX_MIGRATE_DIRTY_TREE if the tree is dirty when applyPlan runs", () => {
    const plan = generateMigrationPlan(tmp);
    writePlan(tmp, plan);
    fs.writeFileSync(path.join(tmp, "dirty.txt"), "x");
    try {
      applyPlan(tmp);
      expect.fail("should have thrown");
    } catch (e: unknown) {
      expect((e as { code?: string }).code).toBe("AICTX_MIGRATE_DIRTY_TREE");
    }
  });
});
