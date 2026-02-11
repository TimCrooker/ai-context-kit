import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAll, diffGenerated, lintConfig, verifyAll } from "../src/index.js";
import { copyFixture } from "./helpers.js";

describe("context engine", () => {
  it("builds generated outputs for fixture", () => {
    const cwd = copyFixture();
    const result = buildAll(cwd);
    expect(result.written.length + result.unchanged.length).toBeGreaterThan(0);

    const agents = fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8");
    const claude = fs.readFileSync(path.join(cwd, "CLAUDE.md"), "utf8");

    expect(agents).toContain("GENERATED FILE");
    expect(claude).toContain("Shared Canonical Context");
  });

  it("reports clean verify state after build", () => {
    const cwd = copyFixture();
    buildAll(cwd);
    const verify = verifyAll(cwd);

    expect(verify.ok).toBe(true);
    expect(verify.errors).toEqual([]);
  });

  it("validates wiring through lint-config", () => {
    const cwd = copyFixture();
    const lint = lintConfig(cwd);

    expect(lint.ok).toBe(true);
    expect(lint.errors).toEqual([]);
  });

  it("detects generated orphan markdown files in diff", () => {
    const cwd = copyFixture();
    buildAll(cwd);

    const orphanPath = path.join(cwd, ".claude/rules/orphan.md");
    const orphanBody = [
      "<!--",
      "  GENERATED FILE: Do not edit directly.",
      "  Source: .ai/context/scopes.json",
      "  Build: ai-context build",
      "-->",
      "",
      "# stale"
    ].join("\n");
    fs.mkdirSync(path.dirname(orphanPath), { recursive: true });
    fs.writeFileSync(orphanPath, orphanBody, "utf8");

    const diff = diffGenerated(cwd);
    expect(diff.items).toEqual(
      expect.arrayContaining([{ path: ".claude/rules/orphan.md", type: "delete" }])
    );
  });
});
