import { describe, expect, it } from "vitest";
import { planSkillMirrors } from "../src/skills.js";
import { ContextError } from "../src/errors.js";
import type { Manifest, SkillSource } from "../src/types.js";

const manifest: Manifest = {
  version: 1,
  modulesDir: ".ai/context/modules",
  scopesFile: ".ai/context/scopes.json",
  targets: {
    root: "AGENTS.md",
    api: "apps/api/AGENTS.md",
    web: "apps/web/AGENTS.md",
  },
  skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"], metaSkill: true },
};

function skill(name: string, scope?: string[]): SkillSource {
  return {
    name,
    dir: `/repo/.ai/skills/${name}`,
    skillMdPath: `/repo/.ai/skills/${name}/SKILL.md`,
    frontmatter: { name, description: "x", scope },
  };
}

describe("planSkillMirrors", () => {
  it("emits root-only mirrors for skills without scope", () => {
    const plan = planSkillMirrors("/repo", manifest, [skill("plain")]);
    expect(plan.map((p) => p.mirror).sort()).toEqual([
      "/repo/.agents/skills/plain",
      "/repo/.claude/skills/plain",
    ]);
  });

  it("emits scope-rooted mirrors when scope: [api] is declared", () => {
    const plan = planSkillMirrors("/repo", manifest, [skill("backend", ["api"])]);
    expect(plan.map((p) => p.mirror).sort()).toEqual([
      "/repo/apps/api/.agents/skills/backend",
      "/repo/apps/api/.claude/skills/backend",
    ]);
  });

  it("emits per-scope mirrors when scope: [api, web]", () => {
    const plan = planSkillMirrors("/repo", manifest, [skill("multi", ["api", "web"])]);
    expect(plan.map((p) => p.mirror).sort()).toEqual([
      "/repo/apps/api/.agents/skills/multi",
      "/repo/apps/api/.claude/skills/multi",
      "/repo/apps/web/.agents/skills/multi",
      "/repo/apps/web/.claude/skills/multi",
    ]);
  });

  it("emits root + every scope when scope: ['*']", () => {
    const plan = planSkillMirrors("/repo", manifest, [skill("everywhere", ["*"])]);
    expect(plan.map((p) => p.mirror).sort()).toEqual([
      "/repo/.agents/skills/everywhere",
      "/repo/.claude/skills/everywhere",
      "/repo/apps/api/.agents/skills/everywhere",
      "/repo/apps/api/.claude/skills/everywhere",
      "/repo/apps/web/.agents/skills/everywhere",
      "/repo/apps/web/.claude/skills/everywhere",
    ]);
  });

  it("throws SKILL_SCOPE_UNKNOWN for undefined scope IDs", () => {
    expect(() => {
      planSkillMirrors("/repo", manifest, [skill("bad", ["nonexistent"])]);
    }).toThrow(ContextError);
    try {
      planSkillMirrors("/repo", manifest, [skill("bad", ["nonexistent"])]);
    } catch (err) {
      expect((err as ContextError).code).toBe("AICTX_SKILL_SCOPE_UNKNOWN");
    }
  });

  it("returns empty plan when manifest.skills is undefined", () => {
    const manifestNoSkills: Manifest = { ...manifest, skills: undefined };
    expect(planSkillMirrors("/repo", manifestNoSkills, [skill("plain")])).toEqual([]);
  });
});
