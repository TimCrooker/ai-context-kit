import { describe, expect, it } from "vitest";
import { buildRootAgents, buildClaudeRoot } from "../src/render.js";
import type { ContextModule, Manifest } from "../src/types.js";

const baseManifest: Manifest = {
  version: 1,
  modulesDir: ".ai/context/modules",
  scopesFile: ".ai/context/scopes.json",
  targets: { root: "AGENTS.md" },
};

const modules: ContextModule[] = [
  {
    id: "overview",
    targets: ["root"],
    order: 10,
    body: "# Overview\n\nSome content.",
    sourcePath: ".ai/context/modules/010-overview.md",
  },
];

describe("kit-awareness stanza", () => {
  it("is absent from AGENTS.md when manifest.skills is undefined", () => {
    const out = buildRootAgents(baseManifest, modules);
    expect(out).not.toContain("ai-context-kit");
    expect(out).not.toContain("Working in this repo");
  });

  it("is present in AGENTS.md when manifest.skills is defined", () => {
    const manifest: Manifest = {
      ...baseManifest,
      skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"], metaSkill: true },
    };
    const out = buildRootAgents(manifest, modules);
    expect(out).toContain("ai-context-kit");
    expect(out).toContain("Working in this repo");
    expect(out).toContain("ai-context build");
  });

  it("is present in CLAUDE.md when manifest.skills is defined", () => {
    const manifest: Manifest = {
      ...baseManifest,
      claudeOutput: "CLAUDE.md",
      skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"], metaSkill: true },
    };
    const out = buildClaudeRoot(manifest, modules);
    expect(out).toContain("ai-context-kit");
  });
});
