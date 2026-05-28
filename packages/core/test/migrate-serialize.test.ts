import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writePlan, readPlan } from "../src/migrate.js";
import type { MigratePlan } from "../src/types.js";

const SAMPLE_PLAN: MigratePlan = {
  version: 1,
  generated_at: "2026-05-26T00:00:00.000Z",
  generator: { kit_version: "1.1.0", cwd: "/some/repo" },
  summary: {
    total_entries_found: 1,
    actions: {
      move_dir: 1,
      promote_bare_md: 0,
      consolidate_symlink: 0,
      keep_existing: 0,
      REVIEW: 0,
    },
    review_candidates: 0,
    applied: false,
  },
  entries: [
    {
      name: "demo",
      current_state: {
        type: "directory_with_skill_md",
        path: ".claude/skills/demo",
        files: ["SKILL.md"],
      },
      action: "move_dir",
      target: {
        source: ".ai/skills/demo",
        mirrors: [".agents/skills/demo", ".claude/skills/demo"],
      },
      rationale: "test",
      applied_at: null,
    },
  ],
  review_candidates: [],
};

describe("migrate plan serialization", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-serialize-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("writePlan creates a JSON file at the default path", () => {
    writePlan(tmp, SAMPLE_PLAN);
    const planPath = path.join(tmp, ".ai/migration-plan.json");
    expect(fs.existsSync(planPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(planPath, "utf8"));
    expect(parsed.version).toBe(1);
    expect(parsed.entries).toHaveLength(1);
  });

  it("writePlan writes pretty-printed JSON (multi-line)", () => {
    writePlan(tmp, SAMPLE_PLAN);
    const content = fs.readFileSync(path.join(tmp, ".ai/migration-plan.json"), "utf8");
    expect(content.split("\n").length).toBeGreaterThan(10);
  });

  it("readPlan round-trips the same plan", () => {
    writePlan(tmp, SAMPLE_PLAN);
    const result = readPlan(tmp);
    expect(result.entries[0]!.name).toBe("demo");
    expect(result.summary.actions.move_dir).toBe(1);
  });

  it("readPlan throws AICTX_MIGRATE_PLAN_NOT_FOUND when file is missing", () => {
    try {
      readPlan(tmp);
      throw new Error("expected throw");
    } catch (e: any) {
      expect(e.code).toBe("AICTX_MIGRATE_PLAN_NOT_FOUND");
    }
  });

  it("readPlan throws AICTX_MIGRATE_PLAN_INVALID when JSON is malformed", () => {
    fs.mkdirSync(path.join(tmp, ".ai"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".ai/migration-plan.json"), "{ not valid json");
    try {
      readPlan(tmp);
      throw new Error("expected throw");
    } catch (e: any) {
      expect(e.code).toBe("AICTX_MIGRATE_PLAN_INVALID");
    }
  });

  it("writePlan refuses to overwrite without force option", () => {
    writePlan(tmp, SAMPLE_PLAN);
    try {
      writePlan(tmp, SAMPLE_PLAN);
      throw new Error("expected throw");
    } catch (e: any) {
      expect(e.code).toBe("AICTX_MIGRATE_PLAN_EXISTS");
    }
  });

  it("writePlan with force=true overwrites existing plan", () => {
    writePlan(tmp, SAMPLE_PLAN);
    const newPlan = {
      ...SAMPLE_PLAN,
      summary: { ...SAMPLE_PLAN.summary, total_entries_found: 99 },
    };
    expect(() => writePlan(tmp, newPlan, { force: true })).not.toThrow();
    expect(readPlan(tmp).summary.total_entries_found).toBe(99);
  });
});
