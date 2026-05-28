import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliBin = path.resolve(__dirname, "../dist/index.js");

describe("ai-context migrate status", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-cli-mstatus-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("reports 'no plan' when no plan file exists", () => {
    const out = execSync(`node ${cliBin} migrate status`, { cwd: tmp }).toString();
    expect(out).toMatch(/no migration plan|not present/i);
  });

  it("reports plan summary when plan exists and unapplied", () => {
    fs.mkdirSync(path.join(tmp, ".ai"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/migration-plan.json"),
      JSON.stringify({
        version: 1,
        generated_at: "2026-01-01T00:00:00Z",
        generator: { kit_version: "1.1.0", cwd: tmp },
        summary: { total_entries_found: 3, actions: { move_dir: 2, promote_bare_md: 1, consolidate_symlink: 0, keep_existing: 0, REVIEW: 0 }, review_candidates: 0, applied: false },
        entries: [],
        review_candidates: [],
      })
    );
    const out = execSync(`node ${cliBin} migrate status`, { cwd: tmp }).toString();
    expect(out).toMatch(/3 entries|unapplied|move_dir: 2/);
  });

  it("reports applied state when plan is applied", () => {
    fs.mkdirSync(path.join(tmp, ".ai"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/migration-plan.json"),
      JSON.stringify({
        version: 1,
        generated_at: "2026-01-01T00:00:00Z",
        generator: { kit_version: "1.1.0", cwd: tmp },
        summary: { total_entries_found: 2, actions: { move_dir: 2, promote_bare_md: 0, consolidate_symlink: 0, keep_existing: 0, REVIEW: 0 }, review_candidates: 0, applied: true },
        entries: [
          { name: "foo", current_state: { type: "directory_with_skill_md", path: "x" }, action: "move_dir", target: { source: ".ai/skills/foo", mirrors: [] }, rationale: "", applied_at: "2026-01-02T00:00:00Z" },
          { name: "bar", current_state: { type: "directory_with_skill_md", path: "x" }, action: "move_dir", target: { source: ".ai/skills/bar", mirrors: [] }, rationale: "", applied_at: "2026-01-02T00:00:00Z" },
        ],
        review_candidates: [],
      })
    );
    const out = execSync(`node ${cliBin} migrate status`, { cwd: tmp }).toString();
    expect(out).toMatch(/applied|2.*\/\s*2/);
  });
});
