import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateMigrationPlan } from "../src/migrate.js";

describe("generateMigrationPlan", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-plan-"));
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
    fs.writeFileSync(
      path.join(tmp, ".ai/context/scopes.json"),
      JSON.stringify({ version: 1, scopes: [] })
    );
    fs.mkdirSync(path.join(tmp, ".ai/context/modules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/modules/010-overview.md"),
      "---\nid: overview\ntargets: [root]\norder: 10\n---\n\n# Overview\n"
    );
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function writeDirSkill(name: string): void {
    const dir = path.join(tmp, ".claude/skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: x\n---\nbody\n`
    );
  }

  function writeBareSkill(name: string): void {
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".claude/skills", `${name}.md`), "# Bare md content\n");
  }

  function writeHandSymlink(name: string): void {
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.mkdirSync(path.join(tmp, ".agents/skills", name), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".agents/skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: x\n---\nbody\n`
    );
    fs.symlinkSync(`../../.agents/skills/${name}`, path.join(tmp, ".claude/skills", name));
  }

  it("returns empty plan when .claude/skills/ does not exist", () => {
    const plan = generateMigrationPlan(tmp);
    expect(plan.entries).toEqual([]);
    expect(plan.summary.total_entries_found).toBe(0);
  });

  it("plans move_dir for a directory skill", () => {
    writeDirSkill("encompass-api");
    const plan = generateMigrationPlan(tmp);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.action).toBe("move_dir");
    expect(plan.entries[0]!.name).toBe("encompass-api");
    expect(plan.summary.actions.move_dir).toBe(1);
  });

  it("plans promote_bare_md for a .md file", () => {
    writeBareSkill("worktree");
    const plan = generateMigrationPlan(tmp);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.action).toBe("promote_bare_md");
    expect(plan.entries[0]!.name).toBe("worktree");
    expect(plan.summary.actions.promote_bare_md).toBe(1);
  });

  it("plans consolidate_symlink for hand-symlinked entries", () => {
    writeHandSymlink("pr-kickoff");
    const plan = generateMigrationPlan(tmp);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.action).toBe("consolidate_symlink");
    expect(plan.summary.actions.consolidate_symlink).toBe(1);
  });

  it("plans keep_existing for README.md", () => {
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".claude/skills/README.md"), "# README\n");
    const plan = generateMigrationPlan(tmp);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.action).toBe("keep_existing");
  });

  it("plans a mixed inventory (40-ish EPMX shape)", () => {
    writeDirSkill("encompass-api");
    writeDirSkill("roam-api");
    writeDirSkill("graph-api");
    writeBareSkill("worktree");
    writeBareSkill("worktree-cleanup");
    writeHandSymlink("pr-kickoff");
    fs.writeFileSync(path.join(tmp, ".claude/skills/README.md"), "# README\n");

    const plan = generateMigrationPlan(tmp);

    expect(plan.summary.total_entries_found).toBe(7);
    expect(plan.summary.actions.move_dir).toBe(3);
    expect(plan.summary.actions.promote_bare_md).toBe(2);
    expect(plan.summary.actions.consolidate_symlink).toBe(1);
    expect(plan.summary.actions.keep_existing).toBe(1);
    expect(plan.summary.applied).toBe(false);
  });

  it("warns when manifest has no skills block", () => {
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
      })
    );
    writeDirSkill("foo");
    const plan = generateMigrationPlan(tmp);
    expect(plan.warnings).toBeDefined();
    expect(plan.warnings![0]).toMatch(/skills.{0,5}block/i);
  });

  it("sorts entries by name", () => {
    writeDirSkill("zebra");
    writeDirSkill("alpha");
    writeDirSkill("middle");
    const plan = generateMigrationPlan(tmp);
    expect(plan.entries.map((e) => e.name)).toEqual(["alpha", "middle", "zebra"]);
  });
});
