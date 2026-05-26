import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyEntry } from "../src/migrate.js";

describe("classifyEntry", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-classify-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("classifies a directory containing SKILL.md as directory_with_skill_md", () => {
    fs.mkdirSync(path.join(tmp, ".claude/skills/encompass-api"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".claude/skills/encompass-api/SKILL.md"),
      "---\nname: encompass-api\ndescription: x\n---\nbody\n"
    );
    const result = classifyEntry(tmp, ".claude/skills/encompass-api", "encompass-api");
    expect(result.type).toBe("directory_with_skill_md");
    expect(result.path).toBe(".claude/skills/encompass-api");
    expect(result.files).toContain("SKILL.md");
  });

  it("classifies a bare-MD file as bare_md", () => {
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".claude/skills/worktree.md"), "# Worktree slash command\n");
    const result = classifyEntry(tmp, ".claude/skills/worktree.md", "worktree");
    expect(result.type).toBe("bare_md");
    expect(result.path).toBe(".claude/skills/worktree.md");
  });

  it("classifies a symlink pointing to .agents/skills/ as existing_symlink", () => {
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.mkdirSync(path.join(tmp, ".agents/skills/pr-kickoff"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".agents/skills/pr-kickoff/SKILL.md"),
      "---\nname: pr-kickoff\ndescription: x\n---\nbody\n"
    );
    fs.symlinkSync("../../.agents/skills/pr-kickoff", path.join(tmp, ".claude/skills/pr-kickoff"));
    const result = classifyEntry(tmp, ".claude/skills/pr-kickoff", "pr-kickoff");
    expect(result.type).toBe("existing_symlink");
    expect(result.current_target).toBe("../../.agents/skills/pr-kickoff");
    expect(result.underlying_source).toBe(".agents/skills/pr-kickoff");
  });

  it("classifies a symlink already pointing to .ai/skills/ as already_kit_managed", () => {
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.mkdirSync(path.join(tmp, ".ai/skills/demo"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/skills/demo/SKILL.md"),
      "---\nname: demo\ndescription: x\n---\nbody\n"
    );
    fs.symlinkSync("../../.ai/skills/demo", path.join(tmp, ".claude/skills/demo"));
    const result = classifyEntry(tmp, ".claude/skills/demo", "demo");
    expect(result.type).toBe("already_kit_managed");
  });

  it("classifies README.md as non_skill_file", () => {
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".claude/skills/README.md"), "# Skills directory README\n");
    const result = classifyEntry(tmp, ".claude/skills/README.md", "README");
    expect(result.type).toBe("non_skill_file");
  });

  it("classifies a directory missing SKILL.md as non_skill_file (avoids false-positive migration)", () => {
    fs.mkdirSync(path.join(tmp, ".claude/skills/orphan"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".claude/skills/orphan/notes.md"), "# stray content\n");
    const result = classifyEntry(tmp, ".claude/skills/orphan", "orphan");
    expect(result.type).toBe("non_skill_file");
  });
});
