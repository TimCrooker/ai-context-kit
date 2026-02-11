import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadManifest, loadModules, loadScopeManifest } from "../src/config.js";
import { ContextError } from "../src/errors.js";
import { copyFixture } from "./helpers.js";

describe("config validation", () => {
  it("throws coded error for invalid manifest JSON", () => {
    const cwd = copyFixture();
    const manifestPath = path.join(cwd, ".ai/context/manifest.json");
    fs.writeFileSync(manifestPath, "{ invalid", "utf8");

    expect(() => loadManifest(cwd)).toThrow(ContextError);
    try {
      loadManifest(cwd);
      throw new Error("expected loadManifest to throw");
    } catch (error) {
      expect((error as ContextError).code).toBe("AICTX_CONFIG_INVALID");
    }
  });

  it("rejects non-numeric module order", () => {
    const cwd = copyFixture();
    const modulePath = path.join(cwd, ".ai/context/modules/010-context-system.md");
    fs.writeFileSync(
      modulePath,
      [
        "---",
        "id: context-system",
        "targets:",
        "  - root",
        "order: high",
        "---",
        "module body"
      ].join("\n"),
      "utf8"
    );

    const manifest = loadManifest(cwd);
    expect(() => loadModules(cwd, manifest)).toThrow(ContextError);
  });

  it("rejects duplicate scope ids", () => {
    const cwd = copyFixture();
    const scopePath = path.join(cwd, ".ai/context/scopes.json");
    const parsed = JSON.parse(fs.readFileSync(scopePath, "utf8")) as {
      scopes: Array<Record<string, unknown>>;
    };
    const first = parsed.scopes[0];
    if (!first) {
      throw new Error("expected at least one scope");
    }
    parsed.scopes.push({ ...first });
    fs.writeFileSync(scopePath, JSON.stringify(parsed, null, 2), "utf8");

    const manifest = loadManifest(cwd);
    expect(() => loadScopeManifest(cwd, manifest)).toThrow(ContextError);
  });
});
