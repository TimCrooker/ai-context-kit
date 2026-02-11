import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAll, lintConfig, verifyAll } from "../src/index.js";

function fixturePath(): string {
  return path.resolve(process.cwd(), "../../examples/listforge-like");
}

function copyFixture(): string {
  const fixture = fixturePath();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-context-kit-"));
  fs.cpSync(fixture, tempDir, { recursive: true });
  return tempDir;
}

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
});
