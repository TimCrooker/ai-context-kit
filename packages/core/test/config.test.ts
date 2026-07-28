import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
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

  it("rejects a module targeting a scoped target instead of silently dropping it", () => {
    const cwd = copyFixture();
    const modulePath = path.join(cwd, ".ai/context/modules/010-context-system.md");
    fs.writeFileSync(
      modulePath,
      ["---", "id: context-system", "targets:", "  - api", "order: 10", "---", "module body"].join(
        "\n"
      ),
      "utf8"
    );

    const manifest = loadManifest(cwd);
    // 'api' IS a valid manifest target, so the unknown-target check passes. Only
    // the root output composes modules, so accepting this would drop the body.
    expect(() => loadModules(cwd, manifest)).toThrow(/only compose into the root output/);
  });

  it("still reports an unknown target distinctly from a scoped one", () => {
    const cwd = copyFixture();
    const modulePath = path.join(cwd, ".ai/context/modules/010-context-system.md");
    fs.writeFileSync(
      modulePath,
      [
        "---",
        "id: context-system",
        "targets:",
        "  - typo",
        "order: 10",
        "---",
        "module body"
      ].join("\n"),
      "utf8"
    );

    const manifest = loadManifest(cwd);
    expect(() => loadModules(cwd, manifest)).toThrow(/unknown target 'typo'/);
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

describe("loadManifest with skills block", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-mfst-"));
    fs.mkdirSync(path.join(tmp, ".ai/context"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/scopes.json"),
      JSON.stringify({ version: 1, scopes: [{ id: "api" }] })
    );
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function writeManifest(extra: Record<string, unknown>): void {
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
        ...extra,
      })
    );
  }

  it("accepts manifest without skills block (backward compat)", () => {
    writeManifest({});
    const manifest = loadManifest(tmp);
    expect(manifest.skills).toBeUndefined();
  });

  it("loads skills block with required fields", () => {
    writeManifest({
      skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"] },
    });
    const manifest = loadManifest(tmp);
    expect(manifest.skills?.source).toBe(".ai/skills");
    expect(manifest.skills?.mirrors).toEqual([".agents/skills", ".claude/skills"]);
    expect(manifest.skills?.metaSkill).toBe(true); // default
  });

  it("rejects skills block without source", () => {
    writeManifest({ skills: { mirrors: [".agents/skills"] } });
    expect(() => loadManifest(tmp)).toThrow(/skills.source/);
  });

  it("rejects skills block with empty mirrors array", () => {
    writeManifest({ skills: { source: ".ai/skills", mirrors: [] } });
    expect(() => loadManifest(tmp)).toThrow(/mirrors.*at least one/);
  });

  it("respects explicit metaSkill: false", () => {
    writeManifest({
      skills: {
        source: ".ai/skills",
        mirrors: [".agents/skills"],
        metaSkill: false,
      },
    });
    const manifest = loadManifest(tmp);
    expect(manifest.skills?.metaSkill).toBe(false);
  });
});
