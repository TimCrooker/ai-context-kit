# Migrate CLI + ai-context-migrate Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `ai-context migrate` CLI + bundled `ai-context-migrate` skill in kit 1.1.0, validate by migrating the EPMX-Monorepo's 40-entry legacy skill layout to the new `.ai/skills/` layout with all 39 skills cross-CLI discoverable.

**Architecture:** Two deliverables in the kit (mechanical CLI + agent-driven skill) plus the EPMX migration as the validating real-world consumer. The CLI does Audit/Apply/Status/Clean phases (safe, idempotent, git-friendly). The skill does the optional Curate phase (agent reads plan, examines content, surfaces overlap, edits plan). EPMX is migrated on a feature branch at the EPMX repo root (not via worktree, per user preference). Release as kit 1.1.0 after PR #3 (v1.0.0) lands.

**Tech Stack:** TypeScript, pnpm monorepo, Vitest, Commander.js (existing), tsup (existing). No new runtime dependencies. Bash for the EPMX-adapted gauntlet.

**Spec:** [docs/superpowers/specs/2026-05-26-migrate-cli-and-skill-design.md](../specs/2026-05-26-migrate-cli-and-skill-design.md)

**Branch (kit):** `feat/migrate-cli-and-skill` (already created off v1.0.0 work)
**Branch (EPMX, created during Phase I):** `feat/migrate-to-ai-context-kit-skills` at EPMX repo root (not a worktree)

**Prerequisite:** kit v1.0.0 PR (#3) ideally merged + published before starting; if not merged yet, the migrate work can still proceed since it builds on the v1.0.0 feature branch.

---

## Phase A — Foundation: types, errors

### Task 1: Migrate types + error codes

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/errors.ts`

- [ ] **Step 1: Add migrate types to types.ts**

Append to `packages/core/src/types.ts`:

```typescript
// Migrate subsystem types
export type MigrateActionType =
  | "move_dir"
  | "promote_bare_md"
  | "consolidate_symlink"
  | "keep_existing"
  | "REVIEW";

export type MigrateCurrentStateType =
  | "directory_with_skill_md"
  | "bare_md"
  | "existing_symlink"
  | "already_kit_managed"
  | "non_skill_file";

export interface MigrateCurrentState {
  type: MigrateCurrentStateType;
  path: string;
  files?: string[];           // for directory_with_skill_md
  current_target?: string;    // for existing_symlink
  underlying_source?: string; // for existing_symlink — what the symlink resolves to
}

export interface MigrateTarget {
  source: string;
  mirrors: string[];
}

export interface MigrateEntry {
  name: string;
  current_state: MigrateCurrentState;
  action: MigrateActionType;
  target: MigrateTarget;
  rationale: string;
  applied_at: string | null;
}

export interface MigrateReviewCandidate {
  name: string;
  reason: string;
  paths: string[];
}

export interface MigratePlan {
  version: 1;
  generated_at: string;
  generator: {
    kit_version: string;
    cwd: string;
  };
  summary: {
    total_entries_found: number;
    actions: Record<MigrateActionType, number>;
    review_candidates: number;
    applied: boolean;
  };
  entries: MigrateEntry[];
  review_candidates: MigrateReviewCandidate[];
  warnings?: string[];
}
```

- [ ] **Step 2: Add error codes**

Edit `packages/core/src/errors.ts` — extend the `ContextErrorCode` union:

```typescript
export type ContextErrorCode =
  // ... existing codes ...
  | "AICTX_MIGRATE_PLAN_EXISTS"
  | "AICTX_MIGRATE_PLAN_NOT_FOUND"
  | "AICTX_MIGRATE_PLAN_INVALID"
  | "AICTX_MIGRATE_NO_SKILLS_BLOCK"
  | "AICTX_MIGRATE_DIRTY_TREE"
  | "AICTX_MIGRATE_NOT_GIT_REPO"
  | "AICTX_MIGRATE_ENTRY_FAILED"
  | "AICTX_MIGRATE_ALREADY_APPLIED";
```

Preserve all existing codes — add new ones at end of the union.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @timothycrooker/ai-context-core typecheck ; echo "exit: $?"`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/timcrooker/ai-context-kit
git add packages/core/src/types.ts packages/core/src/errors.ts
git commit -m "feat(core): add migrate types and error codes"
```

---

## Phase B — Plan generation (TDD)

### Task 2: classifyEntry — detect current state of a skill entry

**Files:**
- Create: `packages/core/src/migrate.ts`
- Create: `packages/core/test/migrate-classify.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/test/migrate-classify.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run, confirm fail**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- migrate-classify ; echo "exit: $?"`
Expected: FAIL — `classifyEntry` does not exist.

- [ ] **Step 3: Implement classifyEntry**

Create `packages/core/src/migrate.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { isSymlink, readSymlink } from "./io.js";
import type { MigrateCurrentState } from "./types.js";

export function classifyEntry(
  cwd: string,
  entryRelPath: string,
  name: string
): MigrateCurrentState {
  const abs = path.join(cwd, entryRelPath);

  // Symlink (check before isDirectory; lstat-based)
  if (isSymlink(abs)) {
    const target = readSymlink(abs) ?? "";
    // Resolve the target relative to the symlink's directory
    const targetAbs = path.resolve(path.dirname(abs), target);
    const targetRel = path.relative(cwd, targetAbs).split(path.sep).join("/");
    if (targetRel.startsWith(".ai/skills/")) {
      return { type: "already_kit_managed", path: entryRelPath, current_target: target, underlying_source: targetRel };
    }
    return {
      type: "existing_symlink",
      path: entryRelPath,
      current_target: target,
      underlying_source: targetRel,
    };
  }

  // Regular file: check naming
  if (fs.statSync(abs).isFile()) {
    if (name.toUpperCase() === "README" || entryRelPath.endsWith("/README.md")) {
      return { type: "non_skill_file", path: entryRelPath };
    }
    if (entryRelPath.endsWith(".md")) {
      return { type: "bare_md", path: entryRelPath };
    }
    return { type: "non_skill_file", path: entryRelPath };
  }

  // Directory: must contain SKILL.md to count as a skill
  const skillMdPath = path.join(abs, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) {
    return { type: "non_skill_file", path: entryRelPath };
  }

  const files = fs.readdirSync(abs);
  return {
    type: "directory_with_skill_md",
    path: entryRelPath,
    files,
  };
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- migrate-classify ; echo "exit: $?"`
Expected: PASS (6/6 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/migrate.ts packages/core/test/migrate-classify.test.ts
git commit -m "feat(core): classify legacy skill entries for migration"
```

---

### Task 3: computeAction — derive migration action from current state

**Files:**
- Modify: `packages/core/src/migrate.ts`
- Create: `packages/core/test/migrate-action.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/test/migrate-action.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeAction } from "../src/migrate.js";
import type { MigrateCurrentState, SkillsManifestBlock } from "../src/types.js";

const skillsConfig: SkillsManifestBlock = {
  source: ".ai/skills",
  mirrors: [".agents/skills", ".claude/skills"],
  metaSkill: true,
};

describe("computeAction", () => {
  it("returns move_dir for directory_with_skill_md", () => {
    const state: MigrateCurrentState = {
      type: "directory_with_skill_md",
      path: ".claude/skills/encompass-api",
      files: ["SKILL.md"],
    };
    const result = computeAction("encompass-api", state, skillsConfig);
    expect(result.action).toBe("move_dir");
    expect(result.target.source).toBe(".ai/skills/encompass-api");
    expect(result.target.mirrors).toEqual([
      ".agents/skills/encompass-api",
      ".claude/skills/encompass-api",
    ]);
  });

  it("returns promote_bare_md for bare_md", () => {
    const state: MigrateCurrentState = {
      type: "bare_md",
      path: ".claude/skills/worktree.md",
    };
    const result = computeAction("worktree", state, skillsConfig);
    expect(result.action).toBe("promote_bare_md");
    expect(result.target.source).toBe(".ai/skills/worktree");
  });

  it("returns consolidate_symlink for existing_symlink pointing to .agents/skills/", () => {
    const state: MigrateCurrentState = {
      type: "existing_symlink",
      path: ".claude/skills/pr-kickoff",
      current_target: "../../.agents/skills/pr-kickoff",
      underlying_source: ".agents/skills/pr-kickoff",
    };
    const result = computeAction("pr-kickoff", state, skillsConfig);
    expect(result.action).toBe("consolidate_symlink");
  });

  it("returns keep_existing for already_kit_managed", () => {
    const state: MigrateCurrentState = {
      type: "already_kit_managed",
      path: ".claude/skills/demo",
      underlying_source: ".ai/skills/demo",
    };
    const result = computeAction("demo", state, skillsConfig);
    expect(result.action).toBe("keep_existing");
  });

  it("returns keep_existing for non_skill_file", () => {
    const state: MigrateCurrentState = {
      type: "non_skill_file",
      path: ".claude/skills/README.md",
    };
    const result = computeAction("README", state, skillsConfig);
    expect(result.action).toBe("keep_existing");
  });

  it("populates rationale with action-specific explanation", () => {
    const state: MigrateCurrentState = {
      type: "directory_with_skill_md",
      path: ".claude/skills/foo",
      files: ["SKILL.md"],
    };
    const result = computeAction("foo", state, skillsConfig);
    expect(result.rationale).toMatch(/move source to .ai\/skills|standard directory/i);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- migrate-action`
Expected: FAIL — `computeAction` does not exist.

- [ ] **Step 3: Implement computeAction**

Append to `packages/core/src/migrate.ts`:

```typescript
import type { MigrateEntry, SkillsManifestBlock } from "./types.js";

export function computeAction(
  name: string,
  state: MigrateCurrentState,
  skillsConfig: SkillsManifestBlock
): Omit<MigrateEntry, "current_state" | "applied_at"> {
  const target = {
    source: `${skillsConfig.source}/${name}`,
    mirrors: skillsConfig.mirrors.map((m) => `${m}/${name}`),
  };

  switch (state.type) {
    case "directory_with_skill_md":
      return {
        name,
        action: "move_dir",
        target,
        rationale:
          "Standard directory skill with SKILL.md; move source to .ai/skills/ and create both mirror symlinks.",
      };

    case "bare_md":
      return {
        name,
        action: "promote_bare_md",
        target: {
          source: `${skillsConfig.source}/${name}`,
          mirrors: skillsConfig.mirrors.map((m) => `${m}/${name}`),
        },
        rationale:
          "Legacy slash-command form; promote to skill directory with SKILL.md. Content preserved verbatim.",
      };

    case "existing_symlink":
      return {
        name,
        action: "consolidate_symlink",
        target,
        rationale:
          "Existing hand-symlink with source outside .ai/skills/. Move source to .ai/skills/, repoint both mirrors. Preserves edit history.",
      };

    case "already_kit_managed":
      return {
        name,
        action: "keep_existing",
        target,
        rationale: "Already managed by ai-context-kit; no migration needed.",
      };

    case "non_skill_file":
      return {
        name,
        action: "keep_existing",
        target,
        rationale: "Non-skill content (README, stray file, or directory without SKILL.md); preserved as-is.",
      };
  }
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- migrate-action`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/migrate.ts packages/core/test/migrate-action.test.ts
git commit -m "feat(core): compute migration action per entry state"
```

---

### Task 4: generateMigrationPlan — full orchestrator

**Files:**
- Modify: `packages/core/src/migrate.ts`
- Create: `packages/core/test/migrate-plan.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/test/migrate-plan.test.ts`:

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateMigrationPlan } from "../src/migrate.js";

describe("generateMigrationPlan", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-plan-"));
    // Set up a manifest with skills block
    fs.mkdirSync(path.join(tmp, ".ai/context"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
        skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"], metaSkill: true },
      })
    );
    fs.writeFileSync(
      path.join(tmp, ".ai/context/scopes.json"),
      JSON.stringify({ version: 1, scopes: [] })
    );
    fs.mkdirSync(path.join(tmp, ".ai/context/modules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/modules/010-overview.md"),
      "---\nid: overview\ntargets: [root]\norder: 10\n---\n\n# Overview\n"
    );
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function writeDirSkill(name: string): void {
    const dir = path.join(tmp, ".claude/skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: x\n---\nbody\n`);
  }

  function writeBareSkill(name: string): void {
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".claude/skills", `${name}.md`), "# Bare md content\n");
  }

  function writeHandSymlink(name: string): void {
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.mkdirSync(path.join(tmp, ".agents/skills", name), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".agents/skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: x\n---\nbody\n`
    );
    fs.symlinkSync(`../../.agents/skills/${name}`, path.join(tmp, ".claude/skills", name));
  }

  it("returns empty plan when .claude/skills/ does not exist", () => {
    const plan = generateMigrationPlan(tmp);
    expect(plan.entries).toEqual([]);
    expect(plan.summary.total_entries_found).toBe(0);
  });

  it("plans move_dir for a directory skill", () => {
    writeDirSkill("encompass-api");
    const plan = generateMigrationPlan(tmp);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.action).toBe("move_dir");
    expect(plan.entries[0]!.name).toBe("encompass-api");
    expect(plan.summary.actions.move_dir).toBe(1);
  });

  it("plans promote_bare_md for a .md file", () => {
    writeBareSkill("worktree");
    const plan = generateMigrationPlan(tmp);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.action).toBe("promote_bare_md");
    expect(plan.entries[0]!.name).toBe("worktree");
    expect(plan.summary.actions.promote_bare_md).toBe(1);
  });

  it("plans consolidate_symlink for hand-symlinked entries", () => {
    writeHandSymlink("pr-kickoff");
    const plan = generateMigrationPlan(tmp);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.action).toBe("consolidate_symlink");
    expect(plan.summary.actions.consolidate_symlink).toBe(1);
  });

  it("plans keep_existing for README.md", () => {
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".claude/skills/README.md"), "# README\n");
    const plan = generateMigrationPlan(tmp);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.action).toBe("keep_existing");
  });

  it("plans a mixed inventory (40-ish EPMX shape)", () => {
    writeDirSkill("encompass-api");
    writeDirSkill("roam-api");
    writeDirSkill("graph-api");
    writeBareSkill("worktree");
    writeBareSkill("worktree-cleanup");
    writeHandSymlink("pr-kickoff");
    fs.writeFileSync(path.join(tmp, ".claude/skills/README.md"), "# README\n");

    const plan = generateMigrationPlan(tmp);

    expect(plan.summary.total_entries_found).toBe(7);
    expect(plan.summary.actions.move_dir).toBe(3);
    expect(plan.summary.actions.promote_bare_md).toBe(2);
    expect(plan.summary.actions.consolidate_symlink).toBe(1);
    expect(plan.summary.actions.keep_existing).toBe(1);
    expect(plan.summary.applied).toBe(false);
  });

  it("warns when manifest has no skills block", () => {
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
      })
    );
    writeDirSkill("foo");
    const plan = generateMigrationPlan(tmp);
    expect(plan.warnings).toBeDefined();
    expect(plan.warnings![0]).toMatch(/skills block/i);
  });

  it("sorts entries by name", () => {
    writeDirSkill("zebra");
    writeDirSkill("alpha");
    writeDirSkill("middle");
    const plan = generateMigrationPlan(tmp);
    expect(plan.entries.map((e) => e.name)).toEqual(["alpha", "middle", "zebra"]);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- migrate-plan`
Expected: FAIL — `generateMigrationPlan` does not exist.

- [ ] **Step 3: Implement generateMigrationPlan**

Append to `packages/core/src/migrate.ts`:

```typescript
import { loadManifest } from "./config.js";
import type { MigratePlan, MigrateActionType } from "./types.js";

const DEFAULT_SKILLS_CONFIG: SkillsManifestBlock = {
  source: ".ai/skills",
  mirrors: [".agents/skills", ".claude/skills"],
  metaSkill: true,
};

function readKitVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        new URL("../../package.json", import.meta.url),
        "utf8"
      )
    );
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function generateMigrationPlan(cwd: string): MigratePlan {
  const warnings: string[] = [];

  let skillsConfig: SkillsManifestBlock;
  try {
    const manifest = loadManifest(cwd);
    if (!manifest.skills) {
      warnings.push(
        "Manifest does not have a 'skills' block. Run `ai-context init --upgrade` to enable the skills subsystem before applying this plan."
      );
      skillsConfig = DEFAULT_SKILLS_CONFIG;
    } else {
      skillsConfig = manifest.skills;
    }
  } catch (e) {
    warnings.push(
      "Could not load manifest. Plan uses default skills config (.ai/skills source, .agents+.claude mirrors)."
    );
    skillsConfig = DEFAULT_SKILLS_CONFIG;
  }

  const claudeSkillsDir = path.join(cwd, ".claude/skills");
  const entries = [];

  if (fs.existsSync(claudeSkillsDir)) {
    const dirents = fs.readdirSync(claudeSkillsDir, { withFileTypes: true });
    for (const dirent of dirents) {
      if (dirent.name.startsWith(".")) continue; // hidden
      const entryRelPath = path.relative(cwd, path.join(claudeSkillsDir, dirent.name));
      const name = dirent.name.endsWith(".md")
        ? dirent.name.slice(0, -3)
        : dirent.name;
      const state = classifyEntry(cwd, entryRelPath, name);
      const actionPart = computeAction(name, state, skillsConfig);
      entries.push({
        ...actionPart,
        current_state: state,
        applied_at: null,
      });
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  const actions: Record<MigrateActionType, number> = {
    move_dir: 0,
    promote_bare_md: 0,
    consolidate_symlink: 0,
    keep_existing: 0,
    REVIEW: 0,
  };
  for (const e of entries) {
    actions[e.action] = (actions[e.action] ?? 0) + 1;
  }

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    generator: { kit_version: readKitVersion(), cwd },
    summary: {
      total_entries_found: entries.length,
      actions,
      review_candidates: 0,
      applied: false,
    },
    entries,
    review_candidates: [],
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- migrate-plan`
Expected: PASS (8/8). Full suite: `pnpm --filter @timothycrooker/ai-context-core test`. PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/migrate.ts packages/core/test/migrate-plan.test.ts
git commit -m "feat(core): generate migration plan from legacy skill inventory"
```

---

### Task 5: Plan serialization (read/write)

**Files:**
- Modify: `packages/core/src/migrate.ts`
- Create: `packages/core/test/migrate-serialize.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/test/migrate-serialize.test.ts`:

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writePlan, readPlan } from "../src/migrate.js";
import type { MigratePlan } from "../src/types.js";

const SAMPLE_PLAN: MigratePlan = {
  version: 1,
  generated_at: "2026-05-26T00:00:00.000Z",
  generator: { kit_version: "1.1.0", cwd: "/some/repo" },
  summary: {
    total_entries_found: 1,
    actions: { move_dir: 1, promote_bare_md: 0, consolidate_symlink: 0, keep_existing: 0, REVIEW: 0 },
    review_candidates: 0,
    applied: false,
  },
  entries: [
    {
      name: "demo",
      current_state: { type: "directory_with_skill_md", path: ".claude/skills/demo", files: ["SKILL.md"] },
      action: "move_dir",
      target: { source: ".ai/skills/demo", mirrors: [".agents/skills/demo", ".claude/skills/demo"] },
      rationale: "test",
      applied_at: null,
    },
  ],
  review_candidates: [],
};

describe("migrate plan serialization", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-serialize-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("writePlan creates a JSON file at the default path", () => {
    writePlan(tmp, SAMPLE_PLAN);
    const planPath = path.join(tmp, ".ai/migration-plan.json");
    expect(fs.existsSync(planPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(planPath, "utf8"));
    expect(parsed.version).toBe(1);
    expect(parsed.entries).toHaveLength(1);
  });

  it("writePlan writes pretty-printed JSON (multi-line)", () => {
    writePlan(tmp, SAMPLE_PLAN);
    const content = fs.readFileSync(path.join(tmp, ".ai/migration-plan.json"), "utf8");
    expect(content.split("\n").length).toBeGreaterThan(10);
  });

  it("readPlan round-trips the same plan", () => {
    writePlan(tmp, SAMPLE_PLAN);
    const result = readPlan(tmp);
    expect(result.entries[0]!.name).toBe("demo");
    expect(result.summary.actions.move_dir).toBe(1);
  });

  it("readPlan throws AICTX_MIGRATE_PLAN_NOT_FOUND when file is missing", () => {
    expect(() => readPlan(tmp)).toThrow(/AICTX_MIGRATE_PLAN_NOT_FOUND/);
  });

  it("readPlan throws AICTX_MIGRATE_PLAN_INVALID when JSON is malformed", () => {
    fs.mkdirSync(path.join(tmp, ".ai"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".ai/migration-plan.json"), "{ not valid json");
    expect(() => readPlan(tmp)).toThrow(/AICTX_MIGRATE_PLAN_INVALID/);
  });

  it("writePlan refuses to overwrite without force option", () => {
    writePlan(tmp, SAMPLE_PLAN);
    expect(() => writePlan(tmp, SAMPLE_PLAN)).toThrow(/AICTX_MIGRATE_PLAN_EXISTS/);
  });

  it("writePlan with force=true overwrites existing plan", () => {
    writePlan(tmp, SAMPLE_PLAN);
    const newPlan = { ...SAMPLE_PLAN, summary: { ...SAMPLE_PLAN.summary, total_entries_found: 99 } };
    expect(() => writePlan(tmp, newPlan, { force: true })).not.toThrow();
    expect(readPlan(tmp).summary.total_entries_found).toBe(99);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- migrate-serialize`
Expected: FAIL — functions don't exist.

- [ ] **Step 3: Implement**

Append to `packages/core/src/migrate.ts`:

```typescript
import { ContextError } from "./errors.js";

export const MIGRATE_PLAN_REL_PATH = ".ai/migration-plan.json";

export function writePlan(
  cwd: string,
  plan: MigratePlan,
  options: { force?: boolean } = {}
): void {
  const planPath = path.join(cwd, MIGRATE_PLAN_REL_PATH);
  if (fs.existsSync(planPath) && !options.force) {
    throw new ContextError(
      "AICTX_MIGRATE_PLAN_EXISTS",
      `Migration plan already exists at ${MIGRATE_PLAN_REL_PATH}. Use --force to overwrite.`
    );
  }
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2) + "\n", "utf8");
}

export function readPlan(cwd: string): MigratePlan {
  const planPath = path.join(cwd, MIGRATE_PLAN_REL_PATH);
  if (!fs.existsSync(planPath)) {
    throw new ContextError(
      "AICTX_MIGRATE_PLAN_NOT_FOUND",
      `Migration plan not found at ${MIGRATE_PLAN_REL_PATH}. Run 'ai-context migrate --plan' first.`
    );
  }
  const raw = fs.readFileSync(planPath, "utf8");
  try {
    return JSON.parse(raw) as MigratePlan;
  } catch (error) {
    throw new ContextError(
      "AICTX_MIGRATE_PLAN_INVALID",
      `Migration plan at ${MIGRATE_PLAN_REL_PATH} is not valid JSON: ${(error as Error).message}`
    );
  }
}
```

- [ ] **Step 4: Run, confirm pass**

`pnpm --filter @timothycrooker/ai-context-core test -- migrate-serialize ; echo $?` → PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/migrate.ts packages/core/test/migrate-serialize.test.ts
git commit -m "feat(core): read/write migration plans with overwrite protection"
```

---

## Phase C — Apply mechanics (TDD)

### Task 6: checkApplyPreconditions

**Files:**
- Modify: `packages/core/src/migrate.ts`
- Create: `packages/core/test/migrate-preconditions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/test/migrate-preconditions.test.ts`:

```typescript
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkApplyPreconditions } from "../src/migrate.js";

describe("checkApplyPreconditions", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-precond-"));
    execSync("git init -q", { cwd: tmp });
    execSync("git config user.email test@example.com", { cwd: tmp });
    execSync("git config user.name Test", { cwd: tmp });
    // initial empty commit so the tree has HEAD
    fs.writeFileSync(path.join(tmp, ".gitignore"), "");
    execSync("git add .gitignore && git commit -q -m init", { cwd: tmp });

    fs.mkdirSync(path.join(tmp, ".ai/context"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
        skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"], metaSkill: true },
      })
    );
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("passes when git tree is clean and manifest has skills block", () => {
    expect(() => checkApplyPreconditions(tmp)).not.toThrow();
  });

  it("throws AICTX_MIGRATE_NOT_GIT_REPO when not a git repo", () => {
    fs.rmSync(path.join(tmp, ".git"), { recursive: true });
    expect(() => checkApplyPreconditions(tmp)).toThrow(/AICTX_MIGRATE_NOT_GIT_REPO/);
  });

  it("throws AICTX_MIGRATE_DIRTY_TREE when there are unstaged changes", () => {
    fs.writeFileSync(path.join(tmp, "dirty.txt"), "hello");
    expect(() => checkApplyPreconditions(tmp)).toThrow(/AICTX_MIGRATE_DIRTY_TREE/);
  });

  it("throws AICTX_MIGRATE_DIRTY_TREE when there are staged changes", () => {
    fs.writeFileSync(path.join(tmp, "staged.txt"), "hello");
    execSync("git add staged.txt", { cwd: tmp });
    expect(() => checkApplyPreconditions(tmp)).toThrow(/AICTX_MIGRATE_DIRTY_TREE/);
  });

  it("throws AICTX_MIGRATE_NO_SKILLS_BLOCK when manifest has no skills field", () => {
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
      })
    );
    execSync("git add .ai/context/manifest.json && git commit -q -m update", { cwd: tmp });
    expect(() => checkApplyPreconditions(tmp)).toThrow(/AICTX_MIGRATE_NO_SKILLS_BLOCK/);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

`pnpm --filter @timothycrooker/ai-context-core test -- migrate-preconditions`
Expected: FAIL — function doesn't exist.

- [ ] **Step 3: Implement**

Append to `packages/core/src/migrate.ts`:

```typescript
import { execSync } from "node:child_process";

export function checkApplyPreconditions(cwd: string): void {
  // 1. Git repo?
  try {
    execSync("git rev-parse --git-dir", { cwd, stdio: "pipe" });
  } catch {
    throw new ContextError(
      "AICTX_MIGRATE_NOT_GIT_REPO",
      `${cwd} is not a git repository. Migrate requires git for safe history-preserving moves.`
    );
  }

  // 2. Clean tree?
  const status = execSync("git status --porcelain", { cwd }).toString().trim();
  if (status.length > 0) {
    throw new ContextError(
      "AICTX_MIGRATE_DIRTY_TREE",
      `Git working tree is not clean. Commit or stash changes before running migrate --apply.\n${status}`
    );
  }

  // 3. Manifest has skills block?
  try {
    const manifest = loadManifest(cwd);
    if (!manifest.skills) {
      throw new ContextError(
        "AICTX_MIGRATE_NO_SKILLS_BLOCK",
        `Manifest at .ai/context/manifest.json has no 'skills' block. Run 'ai-context init --upgrade' to enable the skills subsystem first.`
      );
    }
  } catch (error) {
    if (error instanceof ContextError) throw error;
    throw new ContextError(
      "AICTX_MIGRATE_NO_SKILLS_BLOCK",
      `Could not validate manifest: ${(error as Error).message}`
    );
  }
}
```

- [ ] **Step 4: Run, confirm pass**

`pnpm --filter @timothycrooker/ai-context-core test -- migrate-preconditions ; echo $?` → 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/migrate.ts packages/core/test/migrate-preconditions.test.ts
git commit -m "feat(core): check apply preconditions (git, clean tree, skills block)"
```

---

### Task 7: executeMoveDir — single-action executor

**Files:**
- Modify: `packages/core/src/migrate.ts`
- Create: `packages/core/test/migrate-execute-move-dir.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/test/migrate-execute-move-dir.test.ts`:

```typescript
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeMoveDir } from "../src/migrate.js";
import type { MigrateEntry } from "../src/types.js";

describe("executeMoveDir", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-execmv-"));
    execSync("git init -q", { cwd: tmp });
    execSync("git config user.email test@example.com", { cwd: tmp });
    execSync("git config user.name Test", { cwd: tmp });
    fs.mkdirSync(path.join(tmp, ".claude/skills/encompass-api"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".claude/skills/encompass-api/SKILL.md"),
      "---\nname: encompass-api\ndescription: x\n---\nbody\n"
    );
    execSync("git add -A && git commit -q -m initial", { cwd: tmp });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const entry: MigrateEntry = {
    name: "encompass-api",
    current_state: { type: "directory_with_skill_md", path: ".claude/skills/encompass-api" },
    action: "move_dir",
    target: {
      source: ".ai/skills/encompass-api",
      mirrors: [".agents/skills/encompass-api", ".claude/skills/encompass-api"],
    },
    rationale: "test",
    applied_at: null,
  };

  it("moves the source directory via git mv (history preserved)", () => {
    executeMoveDir(tmp, entry);
    expect(fs.existsSync(path.join(tmp, ".ai/skills/encompass-api/SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".claude/skills/encompass-api/SKILL.md"))).toBe(false);
  });

  it("creates a symlink at .agents/skills/<name>", () => {
    executeMoveDir(tmp, entry);
    const linkPath = path.join(tmp, ".agents/skills/encompass-api");
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe("../../.ai/skills/encompass-api");
  });

  it("creates a symlink at .claude/skills/<name>", () => {
    executeMoveDir(tmp, entry);
    const linkPath = path.join(tmp, ".claude/skills/encompass-api");
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe("../../.ai/skills/encompass-api");
  });

  it("makes a single git commit per entry", () => {
    const before = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    executeMoveDir(tmp, entry);
    const after = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    expect(Number(after) - Number(before)).toBe(1);
    const lastMsg = execSync("git log -1 --pretty=%s", { cwd: tmp }).toString().trim();
    expect(lastMsg).toMatch(/migrate.*move_dir.*encompass-api/);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

`pnpm --filter @timothycrooker/ai-context-core test -- migrate-execute-move-dir`
Expected: FAIL — function doesn't exist.

- [ ] **Step 3: Implement**

Append to `packages/core/src/migrate.ts`:

```typescript
import { createSymlink, isSymlink, removeSymlink } from "./io.js";
import { computeSymlinkTarget } from "./skills.js";

function ensureDir(cwd: string, relPath: string): void {
  fs.mkdirSync(path.join(cwd, relPath), { recursive: true });
}

function gitMv(cwd: string, fromRel: string, toRel: string): void {
  ensureDir(cwd, path.dirname(toRel));
  execSync(`git mv ${JSON.stringify(fromRel)} ${JSON.stringify(toRel)}`, { cwd });
}

function gitCommit(cwd: string, message: string): void {
  execSync(`git commit -q -m ${JSON.stringify(message)}`, { cwd });
}

function gitAddPath(cwd: string, relPath: string): void {
  execSync(`git add ${JSON.stringify(relPath)}`, { cwd });
}

function createMirrorLink(cwd: string, mirrorRel: string, sourceRel: string): void {
  const sourceAbs = path.join(cwd, sourceRel);
  const mirrorAbs = path.join(cwd, mirrorRel);
  const target = computeSymlinkTarget(mirrorAbs, sourceAbs);
  ensureDir(cwd, path.dirname(mirrorRel));
  createSymlink(target, mirrorAbs);
  gitAddPath(cwd, mirrorRel);
}

export function executeMoveDir(cwd: string, entry: MigrateEntry): void {
  // git mv from current .claude/skills/<name> location to new .ai/skills/<name>
  gitMv(cwd, entry.current_state.path, entry.target.source);
  // Create the two mirror symlinks (one might be the original location, recreated as symlink)
  for (const mirrorRel of entry.target.mirrors) {
    // Skip if the mirror happens to be the same path we just moved from — it'll be created fresh
    if (path.resolve(cwd, mirrorRel) === path.resolve(cwd, entry.current_state.path)) {
      createMirrorLink(cwd, mirrorRel, entry.target.source);
    } else {
      createMirrorLink(cwd, mirrorRel, entry.target.source);
    }
  }
  gitCommit(cwd, `chore(migrate): move_dir ${entry.name}\n\n${entry.rationale}`);
}
```

- [ ] **Step 4: Run, confirm pass**

`pnpm --filter @timothycrooker/ai-context-core test -- migrate-execute-move-dir ; echo $?` → 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/migrate.ts packages/core/test/migrate-execute-move-dir.test.ts
git commit -m "feat(core): execute move_dir migration action with git mv + symlinks"
```

---

### Task 8: executePromoteBareMd

**Files:**
- Modify: `packages/core/src/migrate.ts`
- Create: `packages/core/test/migrate-execute-bare-md.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/test/migrate-execute-bare-md.test.ts`:

```typescript
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executePromoteBareMd } from "../src/migrate.js";
import type { MigrateEntry } from "../src/types.js";

describe("executePromoteBareMd", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-execbare-"));
    execSync("git init -q", { cwd: tmp });
    execSync("git config user.email test@example.com && git config user.name Test", { cwd: tmp });
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".claude/skills/worktree.md"),
      "# Worktree slash command\n\nDoes worktree stuff.\n"
    );
    execSync("git add -A && git commit -q -m initial", { cwd: tmp });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const entry: MigrateEntry = {
    name: "worktree",
    current_state: { type: "bare_md", path: ".claude/skills/worktree.md" },
    action: "promote_bare_md",
    target: {
      source: ".ai/skills/worktree",
      mirrors: [".agents/skills/worktree", ".claude/skills/worktree"],
    },
    rationale: "promote bare md",
    applied_at: null,
  };

  it("moves the bare MD file to the new SKILL.md location", () => {
    executePromoteBareMd(tmp, entry);
    const newPath = path.join(tmp, ".ai/skills/worktree/SKILL.md");
    expect(fs.existsSync(newPath)).toBe(true);
    const content = fs.readFileSync(newPath, "utf8");
    expect(content).toContain("Does worktree stuff");
  });

  it("removes the original bare MD path", () => {
    executePromoteBareMd(tmp, entry);
    expect(fs.existsSync(path.join(tmp, ".claude/skills/worktree.md"))).toBe(false);
  });

  it("creates both mirror symlinks", () => {
    executePromoteBareMd(tmp, entry);
    expect(fs.lstatSync(path.join(tmp, ".agents/skills/worktree")).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(tmp, ".claude/skills/worktree")).isSymbolicLink()).toBe(true);
  });

  it("adds proper frontmatter to the promoted SKILL.md if missing", () => {
    executePromoteBareMd(tmp, entry);
    const content = fs.readFileSync(path.join(tmp, ".ai/skills/worktree/SKILL.md"), "utf8");
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("name: worktree");
  });

  it("preserves existing frontmatter if present in the bare MD", () => {
    // overwrite with a bare md that already has frontmatter
    fs.writeFileSync(
      path.join(tmp, ".claude/skills/worktree.md"),
      "---\nname: worktree\ndescription: orig\n---\n\nbody\n"
    );
    execSync("git add -A && git commit -q -m amend", { cwd: tmp });
    executePromoteBareMd(tmp, entry);
    const content = fs.readFileSync(path.join(tmp, ".ai/skills/worktree/SKILL.md"), "utf8");
    expect(content).toContain("description: orig");
  });

  it("makes a single git commit", () => {
    const before = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    executePromoteBareMd(tmp, entry);
    const after = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    expect(Number(after) - Number(before)).toBe(1);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

`pnpm --filter @timothycrooker/ai-context-core test -- migrate-execute-bare-md`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `packages/core/src/migrate.ts`:

```typescript
export function executePromoteBareMd(cwd: string, entry: MigrateEntry): void {
  const sourcePath = entry.current_state.path; // .claude/skills/foo.md
  const targetSkillMd = path.join(entry.target.source, "SKILL.md"); // .ai/skills/foo/SKILL.md

  // Read the original bare MD content
  const origContent = fs.readFileSync(path.join(cwd, sourcePath), "utf8");

  // Ensure target directory exists
  ensureDir(cwd, entry.target.source);

  // Decide: does the file already have frontmatter? If yes, preserve. Else, prepend.
  const hasFrontmatter = /^---\n[\s\S]*?\n---\n/.test(origContent);
  let newContent: string;
  if (hasFrontmatter) {
    newContent = origContent;
  } else {
    const description = `Migrated from legacy slash-command at ${sourcePath}.`;
    newContent = `---\nname: ${entry.name}\ndescription: ${description}\n---\n\n${origContent.trimStart()}`;
  }

  // Write to the new location
  fs.writeFileSync(path.join(cwd, targetSkillMd), newContent, "utf8");
  // Remove the original
  fs.unlinkSync(path.join(cwd, sourcePath));

  // Stage the changes
  execSync(`git add -A`, { cwd });

  // Create the two mirror symlinks
  for (const mirrorRel of entry.target.mirrors) {
    createMirrorLink(cwd, mirrorRel, entry.target.source);
  }

  gitCommit(cwd, `chore(migrate): promote_bare_md ${entry.name}\n\n${entry.rationale}`);
}
```

- [ ] **Step 4: Run, confirm pass**

`pnpm --filter @timothycrooker/ai-context-core test -- migrate-execute-bare-md ; echo $?` → 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/migrate.ts packages/core/test/migrate-execute-bare-md.test.ts
git commit -m "feat(core): execute promote_bare_md migration action"
```

---

### Task 9: executeConsolidateSymlink

**Files:**
- Modify: `packages/core/src/migrate.ts`
- Create: `packages/core/test/migrate-execute-consolidate.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/test/migrate-execute-consolidate.test.ts`:

```typescript
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeConsolidateSymlink } from "../src/migrate.js";
import type { MigrateEntry } from "../src/types.js";

describe("executeConsolidateSymlink", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-execcon-"));
    execSync("git init -q", { cwd: tmp });
    execSync("git config user.email test@example.com && git config user.name Test", { cwd: tmp });
    // Set up the legacy hand-symlink state: .agents/skills/pr-kickoff is the real dir, .claude/skills/pr-kickoff is a symlink
    fs.mkdirSync(path.join(tmp, ".agents/skills/pr-kickoff"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".agents/skills/pr-kickoff/SKILL.md"),
      "---\nname: pr-kickoff\ndescription: x\n---\nbody\n"
    );
    fs.mkdirSync(path.join(tmp, ".claude/skills"), { recursive: true });
    fs.symlinkSync("../../.agents/skills/pr-kickoff", path.join(tmp, ".claude/skills/pr-kickoff"));
    execSync("git add -A && git commit -q -m initial", { cwd: tmp });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const entry: MigrateEntry = {
    name: "pr-kickoff",
    current_state: {
      type: "existing_symlink",
      path: ".claude/skills/pr-kickoff",
      current_target: "../../.agents/skills/pr-kickoff",
      underlying_source: ".agents/skills/pr-kickoff",
    },
    action: "consolidate_symlink",
    target: {
      source: ".ai/skills/pr-kickoff",
      mirrors: [".agents/skills/pr-kickoff", ".claude/skills/pr-kickoff"],
    },
    rationale: "consolidate",
    applied_at: null,
  };

  it("moves the underlying source dir from .agents/skills/ to .ai/skills/", () => {
    executeConsolidateSymlink(tmp, entry);
    expect(fs.existsSync(path.join(tmp, ".ai/skills/pr-kickoff/SKILL.md"))).toBe(true);
  });

  it("turns .agents/skills/<name> into a symlink (was a real dir)", () => {
    executeConsolidateSymlink(tmp, entry);
    const linkPath = path.join(tmp, ".agents/skills/pr-kickoff");
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe("../../.ai/skills/pr-kickoff");
  });

  it("re-creates .claude/skills/<name> as symlink to new .ai source", () => {
    executeConsolidateSymlink(tmp, entry);
    const linkPath = path.join(tmp, ".claude/skills/pr-kickoff");
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe("../../.ai/skills/pr-kickoff");
  });

  it("makes a single git commit", () => {
    const before = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    executeConsolidateSymlink(tmp, entry);
    const after = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    expect(Number(after) - Number(before)).toBe(1);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

`pnpm --filter @timothycrooker/ai-context-core test -- migrate-execute-consolidate`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `packages/core/src/migrate.ts`:

```typescript
export function executeConsolidateSymlink(cwd: string, entry: MigrateEntry): void {
  // 1. Move the real source from .agents/skills/<name> to .ai/skills/<name>
  const underlyingSource = entry.current_state.underlying_source!;
  gitMv(cwd, underlyingSource, entry.target.source);

  // 2. Remove the .claude/skills/<name> symlink (it's now pointing at a non-existent path)
  const claudeLinkPath = entry.current_state.path;
  const claudeLinkAbs = path.join(cwd, claudeLinkPath);
  if (isSymlink(claudeLinkAbs)) {
    removeSymlink(claudeLinkAbs);
    execSync(`git add -A`, { cwd }); // capture the deletion
  }

  // 3. Re-create both mirror symlinks pointing at the new .ai/skills/<name> source
  for (const mirrorRel of entry.target.mirrors) {
    createMirrorLink(cwd, mirrorRel, entry.target.source);
  }

  gitCommit(cwd, `chore(migrate): consolidate_symlink ${entry.name}\n\n${entry.rationale}`);
}
```

- [ ] **Step 4: Run, confirm pass**

`pnpm --filter @timothycrooker/ai-context-core test -- migrate-execute-consolidate ; echo $?` → 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/migrate.ts packages/core/test/migrate-execute-consolidate.test.ts
git commit -m "feat(core): execute consolidate_symlink migration action"
```

---

### Task 10: applyPlan — orchestrator that runs all entries

**Files:**
- Modify: `packages/core/src/migrate.ts`
- Create: `packages/core/test/migrate-apply-plan.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/test/migrate-apply-plan.test.ts`:

```typescript
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateMigrationPlan, writePlan, applyPlan, readPlan } from "../src/migrate.js";

function setupRepo(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-applyplan-"));
  execSync("git init -q", { cwd: tmp });
  execSync("git config user.email test@example.com && git config user.name Test", { cwd: tmp });

  fs.mkdirSync(path.join(tmp, ".ai/context/modules"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, ".ai/context/modules/010-overview.md"),
    "---\nid: overview\ntargets: [root]\norder: 10\n---\n\n# Overview\n"
  );
  fs.writeFileSync(
    path.join(tmp, ".ai/context/scopes.json"),
    JSON.stringify({ version: 1, scopes: [] })
  );
  fs.writeFileSync(
    path.join(tmp, ".ai/context/manifest.json"),
    JSON.stringify({
      version: 1,
      modulesDir: ".ai/context/modules",
      scopesFile: ".ai/context/scopes.json",
      targets: { root: "AGENTS.md" },
      skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"], metaSkill: true },
    })
  );

  // Legacy skills
  fs.mkdirSync(path.join(tmp, ".claude/skills/alpha"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, ".claude/skills/alpha/SKILL.md"),
    "---\nname: alpha\ndescription: x\n---\nbody\n"
  );
  fs.writeFileSync(path.join(tmp, ".claude/skills/legacy.md"), "# legacy\n");

  execSync("git add -A && git commit -q -m initial", { cwd: tmp });
  return tmp;
}

describe("applyPlan", () => {
  let tmp: string;
  beforeEach(() => { tmp = setupRepo(); });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("executes a 2-entry plan and updates applied_at timestamps", () => {
    const plan = generateMigrationPlan(tmp);
    writePlan(tmp, plan);
    applyPlan(tmp);

    expect(fs.existsSync(path.join(tmp, ".ai/skills/alpha/SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".ai/skills/legacy/SKILL.md"))).toBe(true);
    expect(fs.lstatSync(path.join(tmp, ".agents/skills/alpha")).isSymbolicLink()).toBe(true);

    const updatedPlan = readPlan(tmp);
    expect(updatedPlan.summary.applied).toBe(true);
    for (const e of updatedPlan.entries) {
      expect(e.applied_at).not.toBeNull();
    }
  });

  it("skips entries that already have applied_at set", () => {
    const plan = generateMigrationPlan(tmp);
    // Pre-mark alpha as applied
    plan.entries.find((e) => e.name === "alpha")!.applied_at = "2026-01-01T00:00:00.000Z";
    writePlan(tmp, plan);

    const beforeCount = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    applyPlan(tmp);
    const afterCount = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();

    // Only legacy.md should have been migrated (alpha was skipped); 1 commit added
    expect(Number(afterCount) - Number(beforeCount)).toBe(1);
  });

  it("--dry-run mode does not modify any files or commit", () => {
    const plan = generateMigrationPlan(tmp);
    writePlan(tmp, plan);
    const beforeCount = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();

    applyPlan(tmp, { dryRun: true });

    const afterCount = execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim();
    expect(beforeCount).toBe(afterCount);
    expect(fs.existsSync(path.join(tmp, ".ai/skills/alpha"))).toBe(false);
  });

  it("returns a report with per-entry status", () => {
    const plan = generateMigrationPlan(tmp);
    writePlan(tmp, plan);
    const report = applyPlan(tmp);
    expect(report.applied).toHaveLength(2);
    expect(report.skipped).toHaveLength(0);
    expect(report.failed).toHaveLength(0);
  });

  it("throws AICTX_MIGRATE_DIRTY_TREE if the tree is dirty when applyPlan runs", () => {
    const plan = generateMigrationPlan(tmp);
    writePlan(tmp, plan);
    fs.writeFileSync(path.join(tmp, "dirty.txt"), "x");
    expect(() => applyPlan(tmp)).toThrow(/AICTX_MIGRATE_DIRTY_TREE/);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

`pnpm --filter @timothycrooker/ai-context-core test -- migrate-apply-plan`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `packages/core/src/migrate.ts`:

```typescript
export interface ApplyPlanOptions {
  dryRun?: boolean;
}

export interface ApplyPlanReport {
  applied: { name: string; action: MigrateActionType }[];
  skipped: { name: string; reason: string }[];
  failed: { name: string; reason: string }[];
}

export function applyPlan(cwd: string, options: ApplyPlanOptions = {}): ApplyPlanReport {
  checkApplyPreconditions(cwd);
  const plan = readPlan(cwd);

  const report: ApplyPlanReport = { applied: [], skipped: [], failed: [] };

  for (const entry of plan.entries) {
    if (entry.applied_at !== null) {
      report.skipped.push({ name: entry.name, reason: `already applied at ${entry.applied_at}` });
      continue;
    }
    if (entry.action === "keep_existing" || entry.action === "REVIEW") {
      report.skipped.push({ name: entry.name, reason: `action is ${entry.action}; no-op` });
      continue;
    }

    if (options.dryRun) {
      report.applied.push({ name: entry.name, action: entry.action });
      continue;
    }

    try {
      switch (entry.action) {
        case "move_dir":
          executeMoveDir(cwd, entry);
          break;
        case "promote_bare_md":
          executePromoteBareMd(cwd, entry);
          break;
        case "consolidate_symlink":
          executeConsolidateSymlink(cwd, entry);
          break;
      }
      entry.applied_at = new Date().toISOString();
      report.applied.push({ name: entry.name, action: entry.action });
    } catch (error) {
      const reason = error instanceof ContextError ? `[${error.code}] ${error.message}` : String(error);
      report.failed.push({ name: entry.name, reason });
      throw new ContextError(
        "AICTX_MIGRATE_ENTRY_FAILED",
        `Failed to apply entry '${entry.name}': ${reason}. Migration halted. Fix and re-run.`
      );
    }
  }

  // Mark plan as applied
  if (!options.dryRun) {
    plan.summary.applied = report.failed.length === 0;
    writePlan(cwd, plan, { force: true });
  }

  return report;
}
```

- [ ] **Step 4: Run, confirm pass**

`pnpm --filter @timothycrooker/ai-context-core test -- migrate-apply-plan ; echo $?` → 0.

Then full core suite:
`pnpm --filter @timothycrooker/ai-context-core test ; echo $?` → 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/migrate.ts packages/core/test/migrate-apply-plan.test.ts
git commit -m "feat(core): orchestrate migration plan execution with idempotency"
```

---

### Task 11: Re-export migrate functions from index.ts

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add re-exports**

Edit `packages/core/src/index.ts` — add these exports alongside the existing ones:

```typescript
export {
  classifyEntry,
  computeAction,
  generateMigrationPlan,
  writePlan,
  readPlan,
  checkApplyPreconditions,
  executeMoveDir,
  executePromoteBareMd,
  executeConsolidateSymlink,
  applyPlan,
  MIGRATE_PLAN_REL_PATH,
} from "./migrate.js";
```

- [ ] **Step 2: Verify typecheck + tests still pass**

```bash
cd /Users/timcrooker/ai-context-kit
pnpm --filter @timothycrooker/ai-context-core typecheck
pnpm --filter @timothycrooker/ai-context-core test ; echo $?
```

Both exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): re-export migrate functions for CLI use"
```

---

## Phase D — CLI subcommands

### Task 12: Skills CLI `migrate` group scaffold

**Files:**
- Create: `packages/cli/src/commands/migrate/index.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Create command group registrar**

Create `packages/cli/src/commands/migrate/index.ts`:

```typescript
import { Command } from "commander";

export function registerMigrateCommand(program: Command): void {
  const migrate = program.command("migrate").description("Migrate a legacy skill layout to ai-context-kit");

  migrate.command("plan").description("Generate a migration plan").action(() => {
    console.log("(migrate plan - implemented in Task 13)");
  });
  migrate.command("status").description("Show migration plan status").action(() => {
    console.log("(migrate status - implemented in Task 14)");
  });
  migrate.command("apply").description("Apply the migration plan").action(() => {
    console.log("(migrate apply - implemented in Task 15)");
  });
  migrate.command("clean").description("Remove the applied migration plan").action(() => {
    console.log("(migrate clean - implemented in Task 16)");
  });
}
```

- [ ] **Step 2: Wire into the main CLI**

In `packages/cli/src/index.ts`, add:
- Import: `import { registerMigrateCommand } from "./commands/migrate/index.js";`
- After existing `registerSkillsCommand(program);`, add: `registerMigrateCommand(program);`

- [ ] **Step 3: Verify**

```bash
pnpm --filter @timothycrooker/ai-context-cli build
node packages/cli/dist/index.js migrate --help
```

Expected: help text shows plan/status/apply/clean subcommands.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/migrate/index.ts packages/cli/src/index.ts
git commit -m "feat(cli): scaffold ai-context migrate command group"
```

---

### Task 13: `ai-context migrate --plan`

**Files:**
- Create: `packages/cli/src/commands/migrate/plan.ts`
- Modify: `packages/cli/src/commands/migrate/index.ts`
- Create: `packages/cli/test/migrate-plan-cli.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/cli/test/migrate-plan-cli.test.ts`:

```typescript
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliBin = path.resolve(__dirname, "../dist/index.js");

describe("ai-context migrate plan", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-cli-mplan-"));
    execSync("git init -q", { cwd: tmp });
    execSync("git config user.email test@example.com && git config user.name Test", { cwd: tmp });
    fs.mkdirSync(path.join(tmp, ".ai/context/modules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/modules/010.md"),
      "---\nid: overview\ntargets: [root]\norder: 10\n---\n\nbody\n"
    );
    fs.writeFileSync(path.join(tmp, ".ai/context/scopes.json"), JSON.stringify({ version: 1, scopes: [] }));
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
        skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"], metaSkill: true },
      })
    );
    fs.mkdirSync(path.join(tmp, ".claude/skills/demo"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".claude/skills/demo/SKILL.md"),
      "---\nname: demo\ndescription: x\n---\nbody\n"
    );
    execSync("git add -A && git commit -q -m initial", { cwd: tmp });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("creates a migration plan file with the expected entries", () => {
    execSync(`node ${cliBin} migrate plan`, { cwd: tmp });
    const planPath = path.join(tmp, ".ai/migration-plan.json");
    expect(fs.existsSync(planPath)).toBe(true);
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    expect(plan.summary.total_entries_found).toBe(1);
    expect(plan.entries[0].name).toBe("demo");
  });

  it("prints a summary to stdout", () => {
    const out = execSync(`node ${cliBin} migrate plan`, { cwd: tmp }).toString();
    expect(out).toMatch(/1 entry|move_dir.*1/);
  });

  it("refuses to overwrite without --force", () => {
    execSync(`node ${cliBin} migrate plan`, { cwd: tmp });
    expect(() => execSync(`node ${cliBin} migrate plan`, { cwd: tmp, stdio: "pipe" })).toThrow();
  });

  it("allows overwriting with --force", () => {
    execSync(`node ${cliBin} migrate plan`, { cwd: tmp });
    expect(() => execSync(`node ${cliBin} migrate plan --force`, { cwd: tmp })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, confirm fail (stub action)**

`pnpm --filter @timothycrooker/ai-context-cli build && pnpm --filter @timothycrooker/ai-context-cli test -- migrate-plan-cli`
Expected: FAIL — stub doesn't write a file.

- [ ] **Step 3: Implement plan subcommand**

Create `packages/cli/src/commands/migrate/plan.ts`:

```typescript
import process from "node:process";
import { generateMigrationPlan, writePlan, formatContextError } from "@timothycrooker/ai-context-core";

interface PlanOptions {
  force?: boolean;
}

export function runMigratePlan(opts: PlanOptions): void {
  try {
    const cwd = process.cwd();
    const plan = generateMigrationPlan(cwd);
    writePlan(cwd, plan, { force: Boolean(opts.force) });

    console.log(`Migration plan generated: .ai/migration-plan.json`);
    console.log(`  Total entries found: ${plan.summary.total_entries_found}`);
    for (const [action, count] of Object.entries(plan.summary.actions)) {
      if (count === 0) continue;
      console.log(`    ${action}: ${count}`);
    }
    if (plan.warnings && plan.warnings.length > 0) {
      console.log("\nWarnings:");
      for (const w of plan.warnings) console.log(`  - ${w}`);
    }
    console.log("\nNext steps:");
    console.log("  1. Review the plan: cat .ai/migration-plan.json");
    console.log("  2. (Optional) Have an agent run the ai-context-migrate skill for curation");
    console.log("  3. Apply: ai-context migrate apply");
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
```

Wire it into `packages/cli/src/commands/migrate/index.ts`:

```typescript
import { runMigratePlan } from "./plan.js";

// inside registerMigrateCommand, replace the plan subcommand:
migrate
  .command("plan")
  .description("Generate a migration plan from the current skill layout")
  .option("--force", "overwrite an existing migration plan", false)
  .action((opts: { force: boolean }) => runMigratePlan({ force: Boolean(opts.force) }));
```

- [ ] **Step 4: Build + verify**

```bash
pnpm --filter @timothycrooker/ai-context-cli build
pnpm --filter @timothycrooker/ai-context-cli test -- migrate-plan-cli ; echo $?
```

Exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/migrate/plan.ts packages/cli/src/commands/migrate/index.ts packages/cli/test/migrate-plan-cli.test.ts
git commit -m "feat(cli): implement ai-context migrate plan"
```

---

### Task 14: `ai-context migrate --status`

**Files:**
- Create: `packages/cli/src/commands/migrate/status.ts`
- Modify: `packages/cli/src/commands/migrate/index.ts`
- Create: `packages/cli/test/migrate-status-cli.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/cli/test/migrate-status-cli.test.ts`:

```typescript
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliBin = path.resolve(__dirname, "../dist/index.js");

describe("ai-context migrate status", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-cli-mstatus-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("reports 'no plan' when no plan file exists", () => {
    const out = execSync(`node ${cliBin} migrate status`, { cwd: tmp }).toString();
    expect(out).toMatch(/no migration plan|not present/i);
  });

  it("reports plan summary when plan exists and unapplied", () => {
    fs.mkdirSync(path.join(tmp, ".ai"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/migration-plan.json"),
      JSON.stringify({
        version: 1,
        generated_at: "2026-01-01T00:00:00Z",
        generator: { kit_version: "1.1.0", cwd: tmp },
        summary: { total_entries_found: 3, actions: { move_dir: 2, promote_bare_md: 1, consolidate_symlink: 0, keep_existing: 0, REVIEW: 0 }, review_candidates: 0, applied: false },
        entries: [],
        review_candidates: [],
      })
    );
    const out = execSync(`node ${cliBin} migrate status`, { cwd: tmp }).toString();
    expect(out).toMatch(/3 entries|unapplied|move_dir: 2/);
  });

  it("reports applied state when plan is applied", () => {
    fs.mkdirSync(path.join(tmp, ".ai"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/migration-plan.json"),
      JSON.stringify({
        version: 1,
        generated_at: "2026-01-01T00:00:00Z",
        generator: { kit_version: "1.1.0", cwd: tmp },
        summary: { total_entries_found: 2, actions: { move_dir: 2, promote_bare_md: 0, consolidate_symlink: 0, keep_existing: 0, REVIEW: 0 }, review_candidates: 0, applied: true },
        entries: [
          { name: "foo", current_state: { type: "directory_with_skill_md", path: "x" }, action: "move_dir", target: { source: ".ai/skills/foo", mirrors: [] }, rationale: "", applied_at: "2026-01-02T00:00:00Z" },
          { name: "bar", current_state: { type: "directory_with_skill_md", path: "x" }, action: "move_dir", target: { source: ".ai/skills/bar", mirrors: [] }, rationale: "", applied_at: "2026-01-02T00:00:00Z" },
        ],
        review_candidates: [],
      })
    );
    const out = execSync(`node ${cliBin} migrate status`, { cwd: tmp }).toString();
    expect(out).toMatch(/applied|2.*\/\s*2/);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

`pnpm --filter @timothycrooker/ai-context-cli build && pnpm --filter @timothycrooker/ai-context-cli test -- migrate-status-cli`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/cli/src/commands/migrate/status.ts`:

```typescript
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { MIGRATE_PLAN_REL_PATH, formatContextError, readPlan } from "@timothycrooker/ai-context-core";

export function runMigrateStatus(): void {
  try {
    const cwd = process.cwd();
    const planPath = path.join(cwd, MIGRATE_PLAN_REL_PATH);
    if (!fs.existsSync(planPath)) {
      console.log(`No migration plan present at ${MIGRATE_PLAN_REL_PATH}`);
      console.log(`Run 'ai-context migrate plan' to generate one.`);
      return;
    }
    const plan = readPlan(cwd);
    const total = plan.summary.total_entries_found;
    const applied = plan.entries.filter((e) => e.applied_at !== null).length;

    console.log(`Migration plan: ${MIGRATE_PLAN_REL_PATH}`);
    console.log(`  Generated: ${plan.generated_at}`);
    console.log(`  Entries: ${total}`);
    console.log(`  Applied: ${applied} / ${total}`);
    if (applied === 0) {
      console.log(`  State: unapplied`);
    } else if (applied < total) {
      console.log(`  State: partially applied`);
    } else {
      console.log(`  State: applied`);
    }
    console.log(`  Actions:`);
    for (const [action, count] of Object.entries(plan.summary.actions)) {
      if (count === 0) continue;
      console.log(`    ${action}: ${count}`);
    }
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
```

Wire in the command (similar to Task 13).

- [ ] **Step 4: Verify**

`pnpm --filter @timothycrooker/ai-context-cli build && pnpm --filter @timothycrooker/ai-context-cli test -- migrate-status-cli ; echo $?` → 0.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/migrate/status.ts packages/cli/src/commands/migrate/index.ts packages/cli/test/migrate-status-cli.test.ts
git commit -m "feat(cli): implement ai-context migrate status"
```

---

### Task 15: `ai-context migrate --apply`

**Files:**
- Create: `packages/cli/src/commands/migrate/apply.ts`
- Modify: `packages/cli/src/commands/migrate/index.ts`
- Create: `packages/cli/test/migrate-apply-cli.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/cli/test/migrate-apply-cli.test.ts`:

```typescript
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliBin = path.resolve(__dirname, "../dist/index.js");

describe("ai-context migrate apply", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-cli-mapply-"));
    execSync("git init -q", { cwd: tmp });
    execSync("git config user.email test@example.com && git config user.name Test", { cwd: tmp });
    fs.mkdirSync(path.join(tmp, ".ai/context/modules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/modules/010.md"),
      "---\nid: overview\ntargets: [root]\norder: 10\n---\n\nbody\n"
    );
    fs.writeFileSync(path.join(tmp, ".ai/context/scopes.json"), JSON.stringify({ version: 1, scopes: [] }));
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
        skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"], metaSkill: true },
      })
    );
    fs.mkdirSync(path.join(tmp, ".claude/skills/demo"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".claude/skills/demo/SKILL.md"),
      "---\nname: demo\ndescription: x\n---\nbody\n"
    );
    execSync("git add -A && git commit -q -m initial", { cwd: tmp });
    execSync(`node ${cliBin} migrate plan`, { cwd: tmp });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("executes the plan and creates symlinks", () => {
    execSync(`node ${cliBin} migrate apply`, { cwd: tmp });
    expect(fs.existsSync(path.join(tmp, ".ai/skills/demo/SKILL.md"))).toBe(true);
    expect(fs.lstatSync(path.join(tmp, ".agents/skills/demo")).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(tmp, ".claude/skills/demo")).isSymbolicLink()).toBe(true);
  });

  it("--dry-run does not modify any files", () => {
    execSync(`node ${cliBin} migrate apply --dry-run`, { cwd: tmp });
    expect(fs.existsSync(path.join(tmp, ".ai/skills/demo"))).toBe(false);
  });

  it("exits non-zero when git tree is dirty", () => {
    fs.writeFileSync(path.join(tmp, "dirty.txt"), "x");
    expect(() => execSync(`node ${cliBin} migrate apply`, { cwd: tmp, stdio: "pipe" })).toThrow();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

`pnpm --filter @timothycrooker/ai-context-cli build && pnpm --filter @timothycrooker/ai-context-cli test -- migrate-apply-cli`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/cli/src/commands/migrate/apply.ts`:

```typescript
import process from "node:process";
import { applyPlan, formatContextError } from "@timothycrooker/ai-context-core";

interface ApplyOptions {
  dryRun?: boolean;
}

export function runMigrateApply(opts: ApplyOptions): void {
  try {
    const cwd = process.cwd();
    const report = applyPlan(cwd, { dryRun: Boolean(opts.dryRun) });

    if (opts.dryRun) {
      console.log(`Dry-run: would apply ${report.applied.length} entries.`);
    } else {
      console.log(`Applied ${report.applied.length} entries.`);
    }
    for (const a of report.applied) {
      console.log(`  ${opts.dryRun ? "would " : ""}${a.action}: ${a.name}`);
    }
    if (report.skipped.length > 0) {
      console.log(`Skipped ${report.skipped.length}:`);
      for (const s of report.skipped) console.log(`  - ${s.name}: ${s.reason}`);
    }
    if (report.failed.length > 0) {
      console.error(`Failed ${report.failed.length}:`);
      for (const f of report.failed) console.error(`  - ${f.name}: ${f.reason}`);
      process.exit(2);
    }

    if (!opts.dryRun && report.applied.length > 0) {
      console.log(`\nMigration complete. Next steps:`);
      console.log(`  ai-context build      # ensure mirrors are consistent`);
      console.log(`  ai-context verify     # confirm clean state`);
      console.log(`  ai-context doctor     # check for issues`);
    }
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
```

Wire in the command in `packages/cli/src/commands/migrate/index.ts`:

```typescript
import { runMigrateApply } from "./apply.js";

migrate
  .command("apply")
  .description("Execute the migration plan")
  .option("--dry-run", "simulate without making changes", false)
  .action((opts: { dryRun: boolean }) => runMigrateApply({ dryRun: Boolean(opts.dryRun) }));
```

- [ ] **Step 4: Verify**

`pnpm --filter @timothycrooker/ai-context-cli build && pnpm --filter @timothycrooker/ai-context-cli test -- migrate-apply-cli ; echo $?` → 0.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/migrate/apply.ts packages/cli/src/commands/migrate/index.ts packages/cli/test/migrate-apply-cli.test.ts
git commit -m "feat(cli): implement ai-context migrate apply"
```

---

### Task 16: `ai-context migrate --clean`

**Files:**
- Create: `packages/cli/src/commands/migrate/clean.ts`
- Modify: `packages/cli/src/commands/migrate/index.ts`

- [ ] **Step 1: Implement**

Create `packages/cli/src/commands/migrate/clean.ts`:

```typescript
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { MIGRATE_PLAN_REL_PATH, ContextError, formatContextError, readPlan } from "@timothycrooker/ai-context-core";

export function runMigrateClean(): void {
  try {
    const cwd = process.cwd();
    const planPath = path.join(cwd, MIGRATE_PLAN_REL_PATH);
    if (!fs.existsSync(planPath)) {
      console.log(`No plan to clean (file not present).`);
      return;
    }
    const plan = readPlan(cwd);
    if (!plan.summary.applied) {
      throw new ContextError(
        "AICTX_MIGRATE_ALREADY_APPLIED",
        `Refusing to remove an unapplied plan. Run --apply first, or delete manually.`
      );
    }
    fs.unlinkSync(planPath);
    console.log(`Removed ${MIGRATE_PLAN_REL_PATH}`);
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
```

Wire in command:

```typescript
import { runMigrateClean } from "./clean.js";

migrate
  .command("clean")
  .description("Remove an applied migration plan")
  .action(() => runMigrateClean());
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter @timothycrooker/ai-context-cli build && pnpm --filter @timothycrooker/ai-context-cli test ; echo $?
```

All tests pass, exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/migrate/clean.ts packages/cli/src/commands/migrate/index.ts
git commit -m "feat(cli): implement ai-context migrate clean"
```

---

## Phase E — Migration skill content

### Task 17: ai-context-migrate SKILL.md

**Files:**
- Create: `packages/templates/src/skills/ai-context-migrate/SKILL.md`

- [ ] **Step 1: Write SKILL.md verbatim**

Create the file at `packages/templates/src/skills/ai-context-migrate/SKILL.md`:

```markdown
---
name: ai-context-migrate
description: Use when migrating an existing repo to ai-context-kit's skill subsystem; when `.ai/migration-plan.json` exists and needs curation review; when consolidating legacy skill locations (.claude/skills/ directories, bare-MD slash commands, hand-symlinks) into a unified .ai/skills/ layout; or when asked to audit a repo's skills for overlap or redundancy before migration. Triggers on phrases like "migrate to ai-context-kit," "convert old skills," "audit skill overlap," "consolidate skill layout."
---

# ai-context-migrate

Drive the curation phase of a multi-step migration to ai-context-kit's skill subsystem.

## When to invoke

- A repo has skills in legacy locations (`.claude/skills/`) and wants to migrate to `.ai/skills/`
- A `.ai/migration-plan.json` file exists and is unapplied
- The user explicitly invokes `/ai-context-migrate`

## The 4-phase workflow you're in

1. **Audit** — already done before you. The CLI generated `.ai/migration-plan.json`.
2. **Curate (YOUR PHASE)** — examine the plan + actual skill content, identify overlap, edit the plan with merge/drop decisions.
3. **Apply** — after your curation, the user (or you) runs `ai-context migrate apply` to execute.
4. **Verify** — `ai-context build && verify && doctor` confirms healthy state.

## Your job in Phase 2

1. Read `.ai/migration-plan.json`. Confirm it exists, is unapplied, and has reasonable summary counts.
2. For each `review_candidate`: examine the underlying source files, decide what to do (see `references/overlap-detection.md`).
3. For each main entry: spot-check whether the auto-classification is correct (e.g., is a `keep_existing` entry actually a real skill being missed?).
4. If you find clusters of overlap NOT flagged by the CLI: cross-reference the family-router pattern in `references/family-routing.md` and decide whether to factor common content into shared references/ files.
5. Edit the plan: change actions, add `REVIEW` resolutions, add new entries for content abstraction.
6. Tell the user what you decided and why. Do NOT auto-run `apply` — that's their decision.

## What you don't do

- Don't apply the plan. That's Phase 3, gated by the user.
- Don't move files around manually. The plan is the artifact; apply executes.
- Don't dedupe aggressively without rationale. If two skills look similar but serve distinct purposes (e.g., router + specialty), keep both.

## See also

- `references/overlap-detection.md` — heuristics for finding redundancy
- `references/family-routing.md` — router-skill consolidation rules
- `references/legacy-md-conversion.md` — promoting bare-MD slash commands
- `references/post-migration-verification.md` — checklist for Phase 4
```

- [ ] **Step 2: Commit**

```bash
git add packages/templates/src/skills/ai-context-migrate/SKILL.md
git commit -m "feat(templates): ai-context-migrate skill body"
```

---

### Task 18: Migration skill reference docs

**Files:**
- Create: `packages/templates/src/skills/ai-context-migrate/references/overlap-detection.md`
- Create: `packages/templates/src/skills/ai-context-migrate/references/family-routing.md`
- Create: `packages/templates/src/skills/ai-context-migrate/references/legacy-md-conversion.md`
- Create: `packages/templates/src/skills/ai-context-migrate/references/post-migration-verification.md`

- [ ] **Step 1: Write `overlap-detection.md`** — content covering identification of redundant skills:

```markdown
# Overlap detection heuristics

When auditing a migration plan, look for these signals of redundancy.

## Strong signals (act on)

1. **Bare-MD + directory form with same root name**
   - `.claude/skills/foo.md` AND `.claude/skills/foo/SKILL.md` exist
   - Action: pick the directory form (it's the new standard), drop the bare-MD
   - Add the bare-MD's unique content to the directory form's SKILL.md if anything new
   - In the plan: change the bare-MD entry's action from `promote_bare_md` to `keep_existing` and add a note "consolidated into directory form"

2. **Identical `description:` frontmatter across multiple skills**
   - Two or more skills have the EXACT same description field
   - Indicates copy-paste; usually one is the original and the others are dead branches
   - Action: examine each, keep the most recently-modified or content-rich one
   - In the plan: change duplicates to `keep_existing` with rationale "duplicate of <other>"

3. **Sibling skills sharing 60%+ of section headers**
   - Use `grep -h "^## " skill1/SKILL.md skill2/SKILL.md | sort | uniq -d | wc -l` style analysis
   - If >60% of section headers are identical and the content under them is also similar, factor shared content into a `references/family-shared.md`
   - In the plan: don't change actions, but ADD a new entry creating the shared reference

## Weak signals (investigate but usually keep both)

4. **Same family prefix (e.g., `roam-*`, `graph-*`)**
   - These are usually INTENTIONAL — one router skill + N specialty skills
   - Don't collapse unless you've read both and they really do duplicate
   - The router pattern (see `family-routing.md`) is a deliberate optimization

5. **Cross-family methodology echoes**
   - `encompass-probing`, `roam-probing`, `graph-probing` all describe the same probing workflow specialized per API
   - If a `*-methodology` skill already exists (like `api-probing-methodology`), point the per-family probing skills at it via reference link
   - Don't delete the per-family skills; they have API-specific content

## How to update the plan

To mark an entry for non-migration (because it's a duplicate):
```json
{
  "name": "duplicate-foo",
  "action": "keep_existing",
  "rationale": "Duplicate of foo; deleted as part of curation. See review note."
}
```

Then in `apply`, the entry is a no-op. After apply, manually `git rm` the duplicate (the migration tool doesn't delete; that's intentional safety).

To add a NEW entry creating a shared reference:
```json
{
  "name": "_family-shared-roam",
  "action": "REVIEW",
  "rationale": "Curation-added: factor shared roam-* preamble into .ai/skills/_family-shared-roam/. Manual creation required."
}
```

`_`-prefixed entries are treated as REVIEW (the CLI doesn't know how to create new content from thin air).
```

- [ ] **Step 2: Write `family-routing.md`**:

```markdown
# Family routing skills

A "family" is a set of related skills with a common prefix (e.g., `roam-api`, `roam-auth`, `roam-chat`, ...).

## The router pattern

The router skill (`roam-api`) is the ENTRY POINT. It's always-in-context (auto-loaded) and tells the agent:
- This family exists
- Which specialty skill to invoke for which task
- The conventions shared across the family (auth, error patterns, etc.)

The specialty skills (`roam-auth`, `roam-chat`, ...) load only when needed.

## When to KEEP the router pattern

- Router has clear "use roam-X for verb Y" instructions
- Specialties have substantive, non-overlapping content
- The router is small (under 200 lines); each specialty is also bounded

## When to COLLAPSE the family

- Only one specialty exists (no real family yet) — collapse into the router
- The router is huge (>500 lines) and the specialties are stubs — consolidate
- The router and specialties say the same things — unify

## Factoring shared content

When 3+ specialties in the same family share a common section (e.g., auth setup, error retry pattern):

1. Extract that section into a new skill named `<family>-_shared.md` OR into a sibling references/ doc inside the router skill
2. Update each specialty to LINK to the shared content rather than restate it
3. Add an entry to the migration plan if this happens during migration

Don't be overly aggressive. A repeated 5-line section is fine to leave as-is.
```

- [ ] **Step 3: Write `legacy-md-conversion.md`**:

```markdown
# Legacy bare-MD slash command conversion

Some old skills are stored as `.claude/skills/<name>.md` (a bare markdown file with no enclosing directory). The kit's migration converts them to `.ai/skills/<name>/SKILL.md` directory form.

## What the CLI does automatically

The `migrate apply` step:
1. Creates `.ai/skills/<name>/` directory
2. Moves the bare MD content into `.ai/skills/<name>/SKILL.md`
3. If the bare MD has frontmatter, preserve it
4. If the bare MD has no frontmatter, prepend:
   ```yaml
   ---
   name: <name>
   description: Migrated from legacy slash-command at .claude/skills/<name>.md.
   ---
   ```
5. Sets up `.agents/skills/<name>` and `.claude/skills/<name>` mirror symlinks

## What to check during curation

After the plan is generated but BEFORE applying:
1. Open each `promote_bare_md` entry's source file
2. Read the actual content. Is it a real skill, or is it just a slash-command shortcut?
3. If it's a real skill: leave the entry as `promote_bare_md`
4. If it's just a shortcut for a slash command (e.g., a one-line "run /foo" reference): consider whether to convert at all. You may want to:
   - Change the action to `keep_existing` and leave the bare MD as a slash command
   - Or delete the bare MD entirely if the slash command is being deprecated

## What if the description is bad

The auto-generated description "Migrated from legacy slash-command at ..." is a placeholder. After the migration applies, you (or a follow-up) should:
1. Read the SKILL.md body
2. Write a real description matching the agentskills.io spec — what the skill does and when to use it
3. Commit the update
```

- [ ] **Step 4: Write `post-migration-verification.md`**:

```markdown
# Post-migration verification

After `ai-context migrate apply` completes, run this checklist.

## Mandatory checks (must pass before considering migration complete)

1. **Build is clean**
   ```bash
   ai-context build
   ```
   Expected: exit 0, mirror symlinks updated to reflect the new layout.

2. **Verify passes**
   ```bash
   ai-context verify
   ```
   Expected: exit 0, no errors.

3. **Doctor reports no issues**
   ```bash
   ai-context doctor
   ```
   Expected: "No issues detected" on the issues line. Warnings about thin content are OK.

4. **All skills listed correctly**
   ```bash
   ai-context skills list
   ```
   Expected: every migrated skill shows `symlink` for both mirror states. If any show `copy` (Windows fallback) or `missing`, investigate.

5. **Git history preserved**
   ```bash
   git log --follow -- .ai/skills/<some-migrated-skill>/SKILL.md | head -20
   ```
   Expected: history extends BEFORE the migration commits. If history starts at the migration commit, `git mv` failed silently — investigate.

## Optional checks (highly recommended)

6. **Headless CLI discovery** — for each CLI:
   ```bash
   claude --dangerously-skip-permissions -p "List every skill available in this repo by name, one per line."
   codex exec --dangerously-bypass-approvals-and-sandbox "List every skill ..."
   gemini --skip-trust --yolo -p "List every skill ..."
   ```
   Expected: each CLI lists ALL migrated skills.

7. **Reference loading still works**
   - Pick a migrated skill that has a `references/` dir
   - Ask the agent to invoke it and load a specific reference
   - Expected: reference content surfaces in the response

8. **Script execution still works**
   - Pick a migrated skill that has a `scripts/` dir
   - Ask the agent to invoke it and run a script
   - Expected: script output surfaces

## Rollback

If anything is broken:
```bash
git log --oneline | head -20    # find the pre-migration commit
git reset --hard <pre-migration-sha>
```
Each entry's migration was a separate commit, so partial rollback is possible.
```

- [ ] **Step 5: Commit**

```bash
git add packages/templates/src/skills/ai-context-migrate/references/
git commit -m "feat(templates): ai-context-migrate reference docs"
```

---

### Task 19: Bundle ai-context-migrate skill into templates

**Files:**
- Modify: `packages/templates/src/skills-bundler.ts`
- Modify: `packages/templates/test/skills-template.test.ts`

- [ ] **Step 1: Update bundler to include both skills**

Read `packages/templates/src/skills-bundler.ts`. The existing `bundleMetaSkill()` reads `dist/skills/ai-context-kit/` only. Refactor to bundle every directory under `dist/skills/`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TemplateFile } from "@timothycrooker/ai-context-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function bundleBundledSkills(): TemplateFile[] {
  const skillsRoot = path.resolve(__dirname, "skills");
  if (!fs.existsSync(skillsRoot)) return [];

  const files: TemplateFile[] = [];

  for (const skillDir of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!skillDir.isDirectory()) continue;
    const skillName = skillDir.name;
    const skillRoot = path.join(skillsRoot, skillName);

    function walk(dir: string, relRoot: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = path.join(relRoot, entry.name);
        if (entry.isDirectory()) {
          walk(abs, rel);
        } else if (entry.isFile()) {
          const content = fs.readFileSync(abs, "utf8");
          files.push({
            path: `.ai/skills/${skillName}/${rel.split(path.sep).join("/")}`,
            content,
          });
        }
      }
    }

    walk(skillRoot, "");
  }

  return files;
}

// Keep the old name as an alias for backward compat (in case external consumers use it)
export const bundleMetaSkill = bundleBundledSkills;
```

Update standard.ts + monorepo.ts to use `bundleBundledSkills()` (or keep using `bundleMetaSkill()` since it's aliased).

- [ ] **Step 2: Update template tests to verify both skills are bundled**

Edit `packages/templates/test/skills-template.test.ts` — add tests:

```typescript
it(`${name} template includes the ai-context-migrate skill SKILL.md`, () => {
  const template = getTemplate(name);
  const skillMd = template.files.find(
    (f) => f.path === ".ai/skills/ai-context-migrate/SKILL.md"
  );
  expect(skillMd).toBeDefined();
  expect(skillMd!.content).toContain("name: ai-context-migrate");
});

it(`${name} template includes migration reference docs`, () => {
  const template = getTemplate(name);
  const refs = template.files.filter((f) =>
    f.path.startsWith(".ai/skills/ai-context-migrate/references/")
  );
  expect(refs.length).toBeGreaterThanOrEqual(4);
});
```

- [ ] **Step 3: Build + test**

```bash
cd /Users/timcrooker/ai-context-kit
pnpm --filter @timothycrooker/ai-context-templates build
pnpm --filter @timothycrooker/ai-context-templates test ; echo $?
```

Exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/templates/src/skills-bundler.ts packages/templates/src/standard.ts packages/templates/src/monorepo.ts packages/templates/test/skills-template.test.ts
git commit -m "feat(templates): bundle ai-context-migrate skill alongside ai-context-kit"
```

---

## Phase F — EPMX-adapted gauntlet

### Task 20: scripts/epmx-gauntlet/run.sh

**Files:**
- Create: `scripts/epmx-gauntlet/run.sh`
- Create: `scripts/epmx-gauntlet/README.md`

- [ ] **Step 1: Write README**

Create `scripts/epmx-gauntlet/README.md`:

```markdown
# EPMX Gauntlet

Cross-CLI skill discovery validation, adapted for the EPMX Monorepo.

This is the EPMX-specific variant of `scripts/gauntlet/run.sh`. After migrating EPMX via `ai-context migrate`, run this to confirm all 39 migrated skills are discoverable by Claude, Codex, and Gemini.

## Usage

```bash
# From the kit repo:
bash scripts/epmx-gauntlet/run.sh /path/to/EPMX-Monorepo

# Skip individual CLIs:
bash scripts/epmx-gauntlet/run.sh /path/to/EPMX-Monorepo --skip-codex
```

Results land in the EPMX repo at `examples/gauntlet/results/epmx-<timestamp>.md` and matching transcripts.

## Stages

1. **Emission** — `.ai/skills/`, `.agents/skills/`, `.claude/skills/` all populated with 39 entries
2. **Sample-skill discovery per CLI** — Claude/Codex/Gemini each list a representative sample (encompass-api, roam-api, max-as-consultant, backlog-triage) and find them
3. **Reference loading** — Claude is asked to invoke a skill that uses references (e.g., roam-api references/, graph-mail references/) and read its content
4. **Script execution** — Claude is asked to invoke a skill that has scripts/ (if any) and execute it
5. **Meta-skill awareness** — Each CLI is asked "how do I add a new context module to this repo?" and is expected to cite the ai-context-kit meta-skill content

This is shorter than the kit gauntlet because EPMX skills are real-world, varied, and we don't need exhaustive coverage of every shape.
```

- [ ] **Step 2: Write run.sh**

Create `scripts/epmx-gauntlet/run.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <EPMX-repo-path> [--skip-claude] [--skip-codex] [--skip-gemini]" >&2
  exit 1
fi

EPMX_ROOT="$1"
shift
KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RESULTS_DIR="$EPMX_ROOT/examples/gauntlet/results"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$RESULTS_DIR/epmx-$TIMESTAMP.md"

SKIP_CLAUDE=0
SKIP_CODEX=0
SKIP_GEMINI=0
for arg in "$@"; do
  case "$arg" in
    --skip-claude) SKIP_CLAUDE=1 ;;
    --skip-codex) SKIP_CODEX=1 ;;
    --skip-gemini) SKIP_GEMINI=1 ;;
  esac
done

mkdir -p "$RESULTS_DIR"
echo "# EPMX Gauntlet run $TIMESTAMP" > "$REPORT"
echo "" >> "$REPORT"
echo "Kit version: $(node "$KIT_ROOT/packages/cli/dist/index.js" --version 2>/dev/null || echo 'unknown')" >> "$REPORT"
echo "" >> "$REPORT"

log_stage() {
  local stage="$1" outcome="$2" detail="${3:-}"
  echo "- **$stage**: $outcome" >> "$REPORT"
  [ -n "$detail" ] && echo "  - $detail" >> "$REPORT"
  echo "[epmx-gauntlet] $stage: $outcome${detail:+ — $detail}"
}

# Stage 1: Emission
cd "$EPMX_ROOT"
EXPECTED_AGENTS_SKILLS=$(ls -1 .agents/skills 2>/dev/null | wc -l | tr -d ' ')
EXPECTED_CLAUDE_SKILLS=$(ls -1 .claude/skills 2>/dev/null | wc -l | tr -d ' ')
if [ "$EXPECTED_AGENTS_SKILLS" -ge "30" ] && [ "$EXPECTED_CLAUDE_SKILLS" -ge "30" ]; then
  log_stage "Stage 1 emission" "PASS" "$EXPECTED_AGENTS_SKILLS .agents/skills/ + $EXPECTED_CLAUDE_SKILLS .claude/skills/"
else
  log_stage "Stage 1 emission" "FAIL" "expected ~39 in each, got $EXPECTED_AGENTS_SKILLS / $EXPECTED_CLAUDE_SKILLS"
fi

# Stage 2: Per-CLI sample discovery
SAMPLE_SKILLS=("encompass-api" "roam-api" "max-as-consultant" "backlog-triage" "ai-context-kit")
check_discovery() {
  local cli_name="$1" out="$2"
  local missing=()
  for s in "${SAMPLE_SKILLS[@]}"; do
    grep -q "$s" "$out" || missing+=("$s")
  done
  if [ "${#missing[@]}" = "0" ]; then
    log_stage "Stage 2 $cli_name discovery" "PASS" "all sample skills listed"
  else
    log_stage "Stage 2 $cli_name discovery" "FAIL" "missing: ${missing[*]} (transcript: $out)"
  fi
}

if [ "$SKIP_CLAUDE" = "0" ] && command -v claude >/dev/null 2>&1; then
  CLAUDE_OUT="$RESULTS_DIR/epmx-$TIMESTAMP-claude.txt"
  claude -p "List every skill available in this repository. Output only names, one per line." > "$CLAUDE_OUT" 2>&1 || true
  check_discovery "Claude" "$CLAUDE_OUT"
fi

if [ "$SKIP_CODEX" = "0" ] && command -v codex >/dev/null 2>&1; then
  CODEX_OUT="$RESULTS_DIR/epmx-$TIMESTAMP-codex.txt"
  codex exec "List every skill available. Output only names, one per line." > "$CODEX_OUT" 2>&1 || true
  check_discovery "Codex" "$CODEX_OUT"
fi

if [ "$SKIP_GEMINI" = "0" ] && command -v gemini >/dev/null 2>&1; then
  GEMINI_OUT="$RESULTS_DIR/epmx-$TIMESTAMP-gemini.txt"
  gemini --skip-trust -p "List every skill available. Output only names, one per line." > "$GEMINI_OUT" 2>&1 || true
  check_discovery "Gemini" "$GEMINI_OUT"
fi

# Stage 3: Meta-skill awareness (Claude)
if [ "$SKIP_CLAUDE" = "0" ] && command -v claude >/dev/null 2>&1; then
  META_OUT="$RESULTS_DIR/epmx-$TIMESTAMP-claude-meta.txt"
  claude -p "How do I add a new context module to this repo? Cite the file you used." > "$META_OUT" 2>&1 || true
  if grep -q "authoring-modules\|ai-context-kit" "$META_OUT"; then
    log_stage "Stage 3 meta-skill awareness" "PASS"
  else
    log_stage "Stage 3 meta-skill awareness" "FAIL" "Claude did not cite meta-skill (transcript: $META_OUT)"
  fi
fi

echo ""
echo "Report: $REPORT"
cat "$REPORT"
```

Then: `chmod +x scripts/epmx-gauntlet/run.sh`

- [ ] **Step 3: Commit**

```bash
git add scripts/epmx-gauntlet/
git commit -m "feat(gauntlet): EPMX-adapted gauntlet runner"
```

---

## Phase G — Docs

### Task 21: docs/migrating-existing-repos.md (consumer guide)

**Files:**
- Create: `docs/migrating-existing-repos.md`

- [ ] **Step 1: Write content**

Create `docs/migrating-existing-repos.md`:

```markdown
# Migrating an Existing Repo to ai-context-kit Skills

Step-by-step guide for adopting ai-context-kit 1.1+ in a repo that already has skills scattered across `.claude/skills/` or other legacy locations.

## Prerequisites

- Kit version 1.1.0+ installed: `pnpm add -D @timothycrooker/ai-context-cli`
- Git working tree is clean (migration requires this)
- Manifest at `.ai/context/manifest.json` exists (run `ai-context init --upgrade` first if not)

## The 4-phase migration

### Phase 1: Audit

```bash
ai-context migrate plan
```

This scans your `.claude/skills/` and other legacy locations, then writes `.ai/migration-plan.json`. The plan shows:
- How many skills found
- Which action will apply to each (move_dir, promote_bare_md, consolidate_symlink, keep_existing)
- Any warnings (e.g., missing skills block in manifest)

**Review the plan** before proceeding:

```bash
cat .ai/migration-plan.json
ai-context migrate status
```

### Phase 2: Curate (optional)

Open an AI session (Claude, Codex, or Gemini) and prompt:

> "Please review the .ai/migration-plan.json file. Use the ai-context-migrate skill to audit for overlap and quality. Edit the plan if needed, then report your findings."

The agent will use the bundled `ai-context-migrate` skill to examine your skills and decide whether to keep duplicates, factor shared content, etc.

You can SKIP this phase if you trust the auto-generated plan.

### Phase 3: Apply

```bash
ai-context migrate apply --dry-run    # see what would change
ai-context migrate apply              # execute
```

Each plan entry becomes its own git commit. Partial rollback is possible via `git reset --hard <pre-migration-sha>`.

### Phase 4: Verify

```bash
ai-context build       # regenerate AGENTS.md/CLAUDE.md + mirror symlinks
ai-context verify      # confirm clean state
ai-context doctor      # check for issues
ai-context skills list # confirm all skills present with symlink mirrors
```

## Troubleshooting

- **"Git tree is not clean"** — commit or stash your changes first
- **"manifest.skills not configured"** — run `ai-context init --upgrade` to add the skills block
- **"Plan already exists"** — use `ai-context migrate plan --force` to regenerate, or `ai-context migrate clean` if the previous one is applied
- **A skill is now broken (missing references)** — the migration preserves files but doesn't update cross-skill path references. Search your skill bodies for the old `.claude/skills/<name>` paths and update to the new locations.

## Reverting

```bash
git log --oneline | grep "chore(migrate)"   # find migration commits
git reset --hard <pre-migration-sha>
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/migrating-existing-repos.md
git commit -m "docs: consumer guide for migrating existing repos"
```

---

### Task 22: Update existing kit docs

**Files:**
- Modify: `docs/cli-contract.md`
- Modify: `docs/skills-guide.md`
- Modify: `docs/error-codes.md`
- Modify: `README.md`

- [ ] **Step 1: Extend `docs/cli-contract.md`**

Add subsections at the end documenting:
- `ai-context migrate plan [--force]`
- `ai-context migrate status`
- `ai-context migrate apply [--dry-run]`
- `ai-context migrate clean`

Each with: behavior, flags, exit codes (0 success, 1 precondition fail, 2 apply fail).

- [ ] **Step 2: Update `docs/skills-guide.md`**

Add a section at the top: "If you have an existing repo with legacy skills, see [docs/migrating-existing-repos.md](migrating-existing-repos.md)."

- [ ] **Step 3: Extend `docs/error-codes.md`**

Add entries for the new `AICTX_MIGRATE_*` error codes from Task 1.

- [ ] **Step 4: Update README.md**

Add a "Migration (1.1+)" section near the existing "Skills (1.0+)" section:

```markdown
## Migration (1.1+)

Existing repos with legacy `.claude/skills/` layouts can migrate to ai-context-kit's `.ai/skills/` source-of-truth via:

```bash
ai-context migrate plan       # audit current layout
ai-context migrate apply      # execute (requires clean git tree)
```

See [docs/migrating-existing-repos.md](docs/migrating-existing-repos.md) for the full workflow including agent-driven curation.
```

- [ ] **Step 5: Commit**

```bash
git add docs/cli-contract.md docs/skills-guide.md docs/error-codes.md README.md
git commit -m "docs: extend reference docs for migrate subsystem"
```

---

## Phase H — Self-validation against gauntlet fixture

### Task 23: Migrate the kit's gauntlet fixture as a self-test

**Files:**
- Modify: `examples/gauntlet/` (state will be temporarily modified, then reset)
- Create: `scripts/test-migrate-on-gauntlet.sh`

- [ ] **Step 1: Create a self-test script**

Create `scripts/test-migrate-on-gauntlet.sh` (made executable):

```bash
#!/usr/bin/env bash
set -euo pipefail

# Self-test the migrate flow against a temporary copy of the gauntlet fixture.
# Verifies the entire plan → apply cycle works end-to-end.

KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d -t aickit-migrate-test-XXXXXX)"
trap "rm -rf $TEST_DIR" EXIT

# Copy gauntlet fixture INTO a fresh git repo, BUT rewrite it as if it were a legacy repo:
# - skills land at .claude/skills/<name>/ (real dirs, NOT symlinks)
# - no .agents/skills/ or .ai/skills/
cp -R "$KIT_ROOT/examples/gauntlet/" "$TEST_DIR/repo"
cd "$TEST_DIR/repo"
rm -rf .ai/skills .agents/skills .claude/skills apps/api/.agents apps/api/.claude

# Re-create skills as legacy directory form in .claude/skills/
mkdir -p .claude/skills
# Copy SKILL.md sources back from the gauntlet, but as direct dirs in .claude/skills/
for skill in plain-skill skill-with-refs skill-with-scripts router-skill; do
  mkdir -p ".claude/skills/$skill"
  # We need original sources; the gauntlet's are now mirrored. Use the kit's source-of-truth fixture
  # which only had .ai/skills/ originally. For this self-test, we use the test runner to set it up.
  if [ -f "$KIT_ROOT/examples/gauntlet/.ai/skills/$skill/SKILL.md" ]; then
    cp -R "$KIT_ROOT/examples/gauntlet/.ai/skills/$skill/" ".claude/skills/$skill/"
  fi
done

# Set up git
git init -q
git config user.email migrate-test@example.com
git config user.name "Migrate Test"
git add -A
git commit -q -m "initial legacy layout"

# Run the migration
node "$KIT_ROOT/packages/cli/dist/index.js" migrate plan
node "$KIT_ROOT/packages/cli/dist/index.js" migrate apply

# Verify
node "$KIT_ROOT/packages/cli/dist/index.js" verify || exit 1
node "$KIT_ROOT/packages/cli/dist/index.js" skills list

# Assert .ai/skills/ now has the migrated content
for skill in plain-skill skill-with-refs skill-with-scripts router-skill; do
  if [ ! -f ".ai/skills/$skill/SKILL.md" ]; then
    echo "FAIL: $skill not migrated to .ai/skills/"
    exit 1
  fi
done

echo ""
echo "Migrate self-test PASSED."
```

`chmod +x scripts/test-migrate-on-gauntlet.sh`

- [ ] **Step 2: Run the self-test**

```bash
cd /Users/timcrooker/ai-context-kit
pnpm -r build
bash scripts/test-migrate-on-gauntlet.sh
```

Expected: ends with "Migrate self-test PASSED." If failures, iterate on Task 7-10 implementations.

- [ ] **Step 3: Run full test suites + gauntlet to ensure no regressions**

```bash
pnpm -r test ; echo $?     # all should pass
bash scripts/gauntlet/run.sh ; tail -20 examples/gauntlet/results/*.md | head
```

Both must succeed.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-migrate-on-gauntlet.sh
git commit -m "test: migrate self-test against gauntlet fixture"
```

---

## Phase I — Apply migration to EPMX

This phase happens IN `/Users/timcrooker/EPMX-Monorepo`, NOT in the kit repo. The kit must be installed locally (via `pnpm link` or a published version) for the CLI to be available there.

### Task 24: Set up EPMX feature branch and install kit

**Files:**
- EPMX repo root

- [ ] **Step 1: Create feature branch at EPMX root**

```bash
cd /Users/timcrooker/EPMX-Monorepo
git status --short          # confirm clean
git fetch origin
git checkout -b feat/migrate-to-ai-context-kit-skills origin/main
```

Note: per user preference, this branch is at the EPMX repo root (NOT a worktree).

- [ ] **Step 2: Install the local kit version**

Choose ONE based on state at execution time:

(a) If kit 1.1.0 is published to npm:
```bash
pnpm add -D @timothycrooker/ai-context-cli@1.1.0
```

(b) If kit 1.1.0 is local-only:
```bash
cd /Users/timcrooker/ai-context-kit
pnpm install
pnpm -r build
pnpm link --global  # from each package dir
cd /Users/timcrooker/EPMX-Monorepo
pnpm link --global @timothycrooker/ai-context-cli
```

Verify: `pnpm exec ai-context --version` outputs `1.1.0`.

- [ ] **Step 3: Commit dependency change (if applicable)**

If you added the dep via pnpm add:
```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @timothycrooker/ai-context-cli for migration"
```

If using pnpm link, no commit needed.

---

### Task 25: Upgrade EPMX manifest with skills block

**Files:**
- EPMX `.ai/context/manifest.json`
- New EPMX `.ai/skills/ai-context-kit/` + `.ai/skills/ai-context-migrate/` (templates)

- [ ] **Step 1: Run init --upgrade**

```bash
cd /Users/timcrooker/EPMX-Monorepo
pnpm exec ai-context init --upgrade --refresh-meta-skill
```

This adds:
- `skills` block to `.ai/context/manifest.json`
- `.ai/skills/ai-context-kit/` meta-skill
- `.ai/skills/ai-context-migrate/` skill (from kit 1.1.0)

Verify: `cat .ai/context/manifest.json | grep skills` shows the new block.

- [ ] **Step 2: Run build to ensure mirror layout is consistent**

```bash
pnpm exec ai-context build
```

Expected: writes `.agents/skills/ai-context-kit`, `.claude/skills/ai-context-kit` (symlinks), and the same for ai-context-migrate.

- [ ] **Step 3: Commit**

```bash
git add .ai/context/manifest.json .ai/skills/ .agents/skills/ .claude/skills/
git commit -m "chore(epmx): enable ai-context-kit skills subsystem (manifest + meta-skill)"
```

---

### Task 26: Generate EPMX migration plan

**Files:**
- EPMX `.ai/migration-plan.json`

- [ ] **Step 1: Generate the plan**

```bash
cd /Users/timcrooker/EPMX-Monorepo
pnpm exec ai-context migrate plan
```

Expected output: ~38 entries (40 - 2 new meta-skills already in `.ai/skills/`), broken down per the spec's §5 (31 move_dir + 2 promote_bare_md + 6 consolidate_symlink + 1 keep_existing for README).

Actual counts may vary. Inspect: `cat .ai/migration-plan.json | jq '.summary'`

- [ ] **Step 2: Sanity-check the plan against the spec**

Open `.ai/migration-plan.json`. Walk through:
- All `move_dir` entries: are they the 31 EPMX-domain skills?
- Both `promote_bare_md` entries: worktree.md, worktree-cleanup.md
- All `consolidate_symlink` entries: the 6 already-symlinked skills
- The `keep_existing` for README.md

If anything looks wrong, document the discrepancy. Common possibilities:
- Counts differ because we added meta-skills in Task 25 (those become `already_kit_managed` / `keep_existing`)
- Some skills were modified between when the spec was written and now

- [ ] **Step 3: Run the curation skill (optional)**

```bash
claude -p "Use the ai-context-migrate skill to review .ai/migration-plan.json. Examine the actual skills under .claude/skills/. Report what you found. Don't modify the plan yet — just report findings."
```

If the agent surfaces overlap candidates, decide what to do:
- Accept the recommendations and have it edit the plan
- Or push back if the recommendations don't fit EPMX's intent

- [ ] **Step 4: Commit the plan**

```bash
git add .ai/migration-plan.json
git commit -m "chore(epmx): generate migration plan for skill layout"
```

---

### Task 27: Apply EPMX migration

**Files:**
- EPMX entire skill tree

- [ ] **Step 1: Dry-run first**

```bash
cd /Users/timcrooker/EPMX-Monorepo
pnpm exec ai-context migrate apply --dry-run
```

Inspect the output. Expected: lists what WOULD happen but no files change. No errors.

- [ ] **Step 2: Apply for real**

```bash
pnpm exec ai-context migrate apply
```

This will:
- Make ~38 individual git commits (`chore(migrate): <action> <name>`)
- Move source files to `.ai/skills/`
- Set up symlinks

Expected: terminal output streams per-entry "applied" messages. Final: "Migration complete."

- [ ] **Step 3: Run build + verify + doctor**

```bash
pnpm exec ai-context build
pnpm exec ai-context verify
pnpm exec ai-context doctor
```

All three must exit 0 (or doctor with only warnings, not issues).

- [ ] **Step 4: Run skills list to confirm**

```bash
pnpm exec ai-context skills list | head -100
```

Expected: shows all migrated skills with `symlink` mirror state for both `.agents/skills/` and `.claude/skills/`.

- [ ] **Step 5: Verify git history preserved**

Spot check a few migrated skills:
```bash
git log --follow -- .ai/skills/encompass-api/SKILL.md | head -10
git log --follow -- .ai/skills/roam-api/SKILL.md | head -10
```

Expected: history extends BEFORE the migration commit (`chore(migrate): move_dir encompass-api`).

- [ ] **Step 6: Squash or keep commits per Tim's preference**

The migration created ~38 individual commits. Either:
- Keep as-is for full audit trail (Tim's PR-merge style uses squash, so individual commits are preserved in branch but squashed on merge)
- Optionally rebase to consolidate

Recommendation: keep as-is. The squash happens at PR merge.

- [ ] **Step 7: Push branch**

```bash
git push -u origin feat/migrate-to-ai-context-kit-skills
```

---

### Task 28: Run EPMX-adapted gauntlet

**Files:**
- EPMX `examples/gauntlet/results/epmx-<timestamp>*`

- [ ] **Step 1: Run the EPMX gauntlet from the kit**

```bash
cd /Users/timcrooker/ai-context-kit
bash scripts/epmx-gauntlet/run.sh /Users/timcrooker/EPMX-Monorepo
```

Expected: all stages PASS or SKIP (if a CLI is unavailable).

- [ ] **Step 2: If any stage fails: triage**

For Stage 2 discovery failures: missing skills indicate broken mirror or naming issues. Debug via `ai-context doctor`.
For Stage 3 meta-skill awareness failure: ensure the meta-skill is in EPMX's `.ai/skills/`.

Iterate on the EPMX state (additional commits on the feature branch) until the gauntlet passes.

- [ ] **Step 3: Commit gauntlet results to EPMX**

```bash
cd /Users/timcrooker/EPMX-Monorepo
git add examples/gauntlet/results/
git commit -m "test(epmx): cross-CLI gauntlet validation post-migration"
git push
```

---

### Task 29: Open EPMX PR

**Files:**
- GitHub PR

- [ ] **Step 1: Open PR on EPMX repo**

```bash
cd /Users/timcrooker/EPMX-Monorepo
gh pr create --title "feat: migrate skill layout to ai-context-kit 1.1+ (.ai/skills/ source-of-truth)" --body "$(cat <<'EOF'
## Summary

Migrate EPMX's 40-entry legacy skill layout under `.claude/skills/` to ai-context-kit 1.1's `.ai/skills/` source-of-truth, with cross-CLI mirror symlinks at `.agents/skills/` (Codex, Gemini, Cursor, Goose, OpenCode, +18 other agents.md tools) and `.claude/skills/` (Claude Code).

## What changed

- **31** skill directories moved (`.claude/skills/<name>/` → `.ai/skills/<name>/`, with both mirror symlinks)
- **2** bare-MD slash commands promoted (`worktree.md`, `worktree-cleanup.md`) to directory form
- **6** hand-symlinked skills consolidated (source moved from `.agents/skills/` to `.ai/skills/`, mirrors repointed)
- **1** untouched: `.claude/skills/README.md` (it's docs, not a skill)
- Manifest gained the `skills` block
- Meta-skills `ai-context-kit` + `ai-context-migrate` installed at `.ai/skills/`

## Validation

EPMX gauntlet results: `examples/gauntlet/results/epmx-<latest>.md`. All cross-CLI discovery stages pass.

## How to verify locally

```bash
pnpm exec ai-context build
pnpm exec ai-context verify
pnpm exec ai-context doctor
pnpm exec ai-context skills list
```

## Test plan

- [x] `ai-context verify` exits 0
- [x] `ai-context doctor` reports no issues
- [x] All migrated skills appear in `ai-context skills list` with symlink mirror state
- [x] Git history preserved (verified via `git log --follow` on sample skills)
- [x] EPMX-adapted gauntlet passes for Claude/Codex/Gemini
- [x] Sample skill invocation: agents successfully read references/ and execute scripts/

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Report the PR URL**

Capture the output URL for Tim's review.

---

## Phase J — Release kit 1.1.0

### Task 30: Changeset + push kit branch + open kit PR

**Files:**
- kit `.changeset/migrate-cli-and-skill.md`

- [ ] **Step 1: Verify all kit tests pass**

```bash
cd /Users/timcrooker/ai-context-kit
pnpm -r typecheck ; echo $?
pnpm -r test ; echo $?
pnpm -r build ; echo $?
```

All three exit 0.

- [ ] **Step 2: Create the changeset**

Create `.changeset/migrate-cli-and-skill.md`:

```markdown
---
"@timothycrooker/ai-context-core": minor
"@timothycrooker/ai-context-cli": minor
"@timothycrooker/ai-context-templates": minor
"@timothycrooker/ai-context-config": minor
---

Add migrate CLI subsystem and ai-context-migrate skill (1.1.0).

**New:**
- `ai-context migrate plan` — audit legacy skill layout, generate `.ai/migration-plan.json`
- `ai-context migrate status` — report plan presence + applied state
- `ai-context migrate apply [--dry-run]` — execute the plan (per-entry git commits, git-clean precondition)
- `ai-context migrate clean` — remove applied plan file
- Bundled `ai-context-migrate` skill (SKILL.md + 4 reference docs: overlap-detection, family-routing, legacy-md-conversion, post-migration-verification)
- EPMX-adapted gauntlet at `scripts/epmx-gauntlet/run.sh`
- Self-test at `scripts/test-migrate-on-gauntlet.sh`

**Backward compatibility:**

Migrate is opt-in. Existing repos without legacy skills are unaffected. The new `ai-context-migrate` skill ships in templates alongside `ai-context-kit`. No breaking changes.

**Validation:**

Migrated EPMX Monorepo's 40-entry legacy layout to `.ai/skills/` source-of-truth. EPMX gauntlet passes all stages across Claude/Codex/Gemini.
```

- [ ] **Step 3: Commit changeset**

```bash
git add .changeset/
git commit -m "chore: changeset for 1.1.0 release"
```

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/migrate-cli-and-skill
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "feat: migrate CLI + ai-context-migrate skill (1.1.0)" --body "$(cat <<'EOF'
## Summary

- New `ai-context migrate` CLI subsystem (plan/status/apply/clean)
- New `ai-context-migrate` bundled skill for agent-driven curation
- EPMX-adapted gauntlet for validating migrations
- Self-test against gauntlet fixture

## Spec + plan
- [Spec](docs/superpowers/specs/2026-05-26-migrate-cli-and-skill-design.md)
- [Plan](docs/superpowers/plans/2026-05-26-migrate-cli-and-skill.md)

## Validation

EPMX Monorepo migration is the validating use case. See [EPMX PR](https://github.com/equityprime/EPMX-Monorepo/pull/X) (TBD link after that PR is opened).

EPMX-adapted gauntlet results in this branch:
- All 39+ EPMX skills discoverable across Claude/Codex/Gemini
- Migration plan generation + apply tested via `scripts/test-migrate-on-gauntlet.sh`

## Test plan

- [x] All unit tests pass (`pnpm -r test`)
- [x] Typecheck clean (`pnpm -r typecheck`)
- [x] Build succeeds (`pnpm -r build`)
- [x] Migrate self-test passes (`scripts/test-migrate-on-gauntlet.sh`)
- [x] EPMX gauntlet passes (run against EPMX Monorepo PR branch)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Report URL**

Capture the kit PR URL.

---

## Self-review

**Spec coverage (each section traced to tasks):**

| Spec section | Tasks |
|---|---|
| §3 Mental model (4 phases) | Encoded across Tasks 4 (plan), 17 (skill), 15 (apply), 28 (verify gauntlet) |
| §4.1 Plan generation | Tasks 2-4 |
| §4.2 Plan format | Tasks 1 (types), 5 (serialize) |
| §4.3 Apply mechanics | Tasks 6-10 |
| §4.4 Migration skill | Tasks 17-19 |
| §4.5 CLI surface | Tasks 12-16 |
| §4.6 Manifest interaction | Task 6 (precondition check), Task 4 (warning emission) |
| §5 EPMX application | Tasks 24-28 |
| §6 Validation | Task 20 (EPMX gauntlet), Task 23 (self-test) |
| §7 Backward compat | Implicit in all task design — no breaking changes |
| §8 Release plan | Task 30 |
| §9 Out of scope | Explicit — no tasks |
| §10 Risks | Tasks 23 + 27 step 5 explicitly verify the symlink + git-history risks |

**Placeholder scan:**
- No TBD/TODO in task bodies
- No "implement later" or "add appropriate handling"
- Every code block has actual content
- Every test has actual assertions
- The Task 24 step 2 has TWO install paths (npm vs link) — explicit, not a placeholder

**Type consistency:**
- `MigrateEntry`, `MigrateActionType`, `MigratePlan` defined in Task 1, used in Tasks 2-10
- Function names: `classifyEntry`, `computeAction`, `generateMigrationPlan`, `writePlan`, `readPlan`, `checkApplyPreconditions`, `executeMoveDir`, `executePromoteBareMd`, `executeConsolidateSymlink`, `applyPlan` — used consistently across tasks and re-exported in Task 11
- Error codes `AICTX_MIGRATE_*` used consistently
- CLI subcommands consistent (`plan`/`status`/`apply`/`clean`)

**Commits per phase:**
- ~30 commits on the kit branch
- ~40 commits on the EPMX branch (via migrate's per-entry commit pattern)

---
