import { describe, expect, it } from "vitest";
import { computeAction } from "../src/migrate.js";
import type { MigrateCurrentState, SkillsManifestBlock } from "../src/types.js";

const skillsConfig: SkillsManifestBlock = {
  source: ".ai/skills",
  mirrors: [".agents/skills", ".claude/skills"],
  metaSkill: true,
};

describe("computeAction", () => {
  it("returns move_dir for directory_with_skill_md", () => {
    const state: MigrateCurrentState = {
      type: "directory_with_skill_md",
      path: ".claude/skills/encompass-api",
      files: ["SKILL.md"],
    };
    const result = computeAction("encompass-api", state, skillsConfig);
    expect(result.action).toBe("move_dir");
    expect(result.target.source).toBe(".ai/skills/encompass-api");
    expect(result.target.mirrors).toEqual([
      ".agents/skills/encompass-api",
      ".claude/skills/encompass-api",
    ]);
  });

  it("returns promote_bare_md for bare_md", () => {
    const state: MigrateCurrentState = {
      type: "bare_md",
      path: ".claude/skills/worktree.md",
    };
    const result = computeAction("worktree", state, skillsConfig);
    expect(result.action).toBe("promote_bare_md");
    expect(result.target.source).toBe(".ai/skills/worktree");
  });

  it("returns consolidate_symlink for existing_symlink pointing to .agents/skills/", () => {
    const state: MigrateCurrentState = {
      type: "existing_symlink",
      path: ".claude/skills/pr-kickoff",
      current_target: "../../.agents/skills/pr-kickoff",
      underlying_source: ".agents/skills/pr-kickoff",
    };
    const result = computeAction("pr-kickoff", state, skillsConfig);
    expect(result.action).toBe("consolidate_symlink");
  });

  it("returns keep_existing for already_kit_managed", () => {
    const state: MigrateCurrentState = {
      type: "already_kit_managed",
      path: ".claude/skills/demo",
      underlying_source: ".ai/skills/demo",
    };
    const result = computeAction("demo", state, skillsConfig);
    expect(result.action).toBe("keep_existing");
  });

  it("returns keep_existing for non_skill_file", () => {
    const state: MigrateCurrentState = {
      type: "non_skill_file",
      path: ".claude/skills/README.md",
    };
    const result = computeAction("README", state, skillsConfig);
    expect(result.action).toBe("keep_existing");
  });

  it("populates rationale with action-specific explanation", () => {
    const state: MigrateCurrentState = {
      type: "directory_with_skill_md",
      path: ".claude/skills/foo",
      files: ["SKILL.md"],
    };
    const result = computeAction("foo", state, skillsConfig);
    expect(result.rationale).toMatch(/move source to \.ai\/skills|standard directory/i);
  });
});
