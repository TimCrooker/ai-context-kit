import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOrphanedSkillMirrors } from "../src/skills.js";
import type { Manifest } from "../src/types.js";

describe("findOrphanedSkillMirrors", () => {
  let tmp: string;
  const manifest: Manifest = {
    version: 1,
    modulesDir: ".ai/context/modules",
    scopesFile: ".ai/context/scopes.json",
    targets: { root: "AGENTS.md", api: "apps/api/AGENTS.md" },
    skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"], metaSkill: true },
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-orphan-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function makeMirror(rel: string, sourceRel: string): string {
    const full = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const target = path.relative(path.dirname(full), path.join(tmp, sourceRel));
    fs.symlinkSync(target, full, "dir");
    return full;
  }

  it("returns empty when every mirror has a matching source", () => {
    fs.mkdirSync(path.join(tmp, ".ai/skills/alpha"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/skills/alpha/SKILL.md"),
      "---\nname: alpha\ndescription: x\n---\nbody\n"
    );
    makeMirror(".agents/skills/alpha", ".ai/skills/alpha");

    const orphans = findOrphanedSkillMirrors(tmp, manifest, ["alpha"]);
    expect(orphans).toEqual([]);
  });

  it("finds mirrors whose source no longer exists", () => {
    makeMirror(".agents/skills/deleted-skill", ".ai/skills/deleted-skill");
    const orphans = findOrphanedSkillMirrors(tmp, manifest, []);
    expect(orphans).toContain(path.join(tmp, ".agents/skills/deleted-skill"));
  });

  it("finds orphan mirrors under per-scope locations", () => {
    makeMirror("apps/api/.claude/skills/old-skill", ".ai/skills/old-skill");
    const orphans = findOrphanedSkillMirrors(tmp, manifest, []);
    expect(orphans).toContain(path.join(tmp, "apps/api/.claude/skills/old-skill"));
  });

  it("ignores files that are not symlinks (treats them as user content)", () => {
    fs.mkdirSync(path.join(tmp, ".agents/skills/user-skill"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".agents/skills/user-skill/SKILL.md"),
      "---\nname: user-skill\ndescription: hand-authored\n---\nbody\n"
    );
    const orphans = findOrphanedSkillMirrors(tmp, manifest, []);
    expect(orphans).not.toContain(path.join(tmp, ".agents/skills/user-skill"));
  });
});
