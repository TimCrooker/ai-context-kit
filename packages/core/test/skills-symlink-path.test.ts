import { describe, expect, it } from "vitest";
import { computeSymlinkTarget } from "../src/skills.js";

describe("computeSymlinkTarget", () => {
  it("computes path from .agents/skills/x to .ai/skills/x at repo root", () => {
    expect(
      computeSymlinkTarget("/repo/.agents/skills/demo", "/repo/.ai/skills/demo")
    ).toBe("../../.ai/skills/demo");
  });

  it("computes path from .claude/skills/x to .ai/skills/x at repo root", () => {
    expect(
      computeSymlinkTarget("/repo/.claude/skills/demo", "/repo/.ai/skills/demo")
    ).toBe("../../.ai/skills/demo");
  });

  it("computes path from apps/api/.agents/skills/x to repo-root .ai/skills/x", () => {
    expect(
      computeSymlinkTarget(
        "/repo/apps/api/.agents/skills/demo",
        "/repo/.ai/skills/demo"
      )
    ).toBe("../../../../.ai/skills/demo");
  });

  it("normalizes target to POSIX separators even on Windows-style input", () => {
    const result = computeSymlinkTarget("/repo/.agents/skills/x", "/repo/.ai/skills/x");
    expect(result).not.toContain("\\");
  });
});
