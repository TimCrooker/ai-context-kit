import { describe, expect, it } from "vitest";
import { getTemplate } from "../src/index.js";

describe("default template", () => {
  it("emits parseable manifest and scopes files", () => {
    const template = getTemplate("default");
    const manifest = template.files.find((f) => f.path === ".ai/context/manifest.json");
    const scopes = template.files.find((f) => f.path === ".ai/context/scopes.json");

    expect(manifest).toBeDefined();
    expect(scopes).toBeDefined();

    const manifestJson = JSON.parse(manifest!.content) as Record<string, unknown>;
    const scopesJson = JSON.parse(scopes!.content) as Record<string, unknown>;

    expect(manifestJson.$schema).toBe("./schemas/manifest.schema.json");
    expect(manifestJson.version).toBe(1);
    expect(scopesJson.$schema).toBe("./schemas/scopes.schema.json");
    expect(scopesJson.version).toBe(1);
  });

  it("uses real newlines in generated markdown rule files", () => {
    const template = getTemplate("default");
    const markdownRules = template.files.filter((f) => f.path.startsWith(".ai/rules/"));

    expect(markdownRules.length).toBeGreaterThan(0);
    for (const file of markdownRules) {
      expect(file.content).not.toContain("\\n");
      expect(file.content).toContain("\n");
    }
  });
});
