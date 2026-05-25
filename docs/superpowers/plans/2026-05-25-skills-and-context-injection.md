# Skills + Cross-CLI Context Injection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class skill authoring (author once at `.ai/skills/<name>/`, double-symlink to `.agents/skills/` + `.claude/skills/`), ship the kit's own `ai-context-kit` meta-skill into every consuming repo, inject lean kit-awareness stanzas into generated `AGENTS.md`/`CLAUDE.md`, and validate via headless gauntlet across Claude/Codex/Gemini — releasing as `@timothycrooker/ai-context-{core,cli,templates,config}@1.0.0`.

**Architecture:** Source at `.ai/skills/<name>/` is a directory tree (`SKILL.md` + optional `references/`, `scripts/`, `assets/`). On `ai-context build`, the kit creates relative directory symlinks at each path listed in `manifest.skills.mirrors` (default `[".agents/skills", ".claude/skills"]`), plus per-scope mirrors when frontmatter declares `scope: [...]`. On Windows or filesystems that refuse symlinks, fall back to recursive copy + `_generated:` banner + chmod for exec bits. The kit's meta-skill lives at `.ai/skills/ai-context-kit/` and exercises the rich-skill case (references/ + scripts/) — dogfood validation.

**Tech Stack:** TypeScript, pnpm monorepo, Vitest, Commander.js, tsup, YAML (existing dep), Node 20+. No new runtime dependencies.

**Spec:** [docs/superpowers/specs/2026-05-25-skills-and-context-injection-design.md](../specs/2026-05-25-skills-and-context-injection-design.md)

**Error code convention:** All new codes use the existing `AICTX_*` prefix (verified from `packages/core/src/errors.ts`). The spec mentioned `CTX_E_*` — that's a spec typo; this plan and code use `AICTX_*`.

---

## Phase A — Foundation: types, errors, schema

### Task 1: Add skill types, error codes, and manifest schema field

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/errors.ts`
- Modify: `packages/templates/src/standard.ts` (the `MANIFEST_SCHEMA` JSON inlined there)

- [ ] **Step 1: Extend `errors.ts` with skill-specific error codes**

Edit `packages/core/src/errors.ts` to add codes to the `ContextErrorCode` union:

```typescript
export type ContextErrorCode =
  | "AICTX_CONFIG_INVALID"
  | "AICTX_CONFIG_MISSING"
  | "AICTX_FRONT_MATTER_INVALID"
  | "AICTX_GENERATION_INVALID"
  | "AICTX_INIT_FAILED"
  | "AICTX_INTERNAL"
  | "AICTX_SKILL_FRONTMATTER_INVALID"
  | "AICTX_SKILL_NAME_INVALID"
  | "AICTX_SKILL_MISSING_FILE"
  | "AICTX_SKILL_SCOPE_UNKNOWN"
  | "AICTX_SKILL_MIRROR_CONFLICT"
  | "AICTX_SKILL_MIRROR_BROKEN";
```

- [ ] **Step 2: Add skill types to `types.ts`**

Append to `packages/core/src/types.ts`:

```typescript
export interface SkillsManifestBlock {
  source: string;
  mirrors: string[];
  metaSkill: boolean;
}

export interface Manifest {
  version: 1;
  modulesDir: string;
  scopesFile: string;
  targets: Record<string, string>;
  claudeOutput?: string;
  skills?: SkillsManifestBlock;
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  scope?: string[];
  license?: string;
  compatibility?: string;
  metadata?: Record<string, unknown>;
  "allowed-tools"?: string | string[];
  [extra: string]: unknown;
}

export interface SkillSource {
  name: string;
  dir: string;
  skillMdPath: string;
  frontmatter: SkillFrontmatter;
}

export interface SkillMirrorPlan {
  source: string;
  mirror: string;
  mode: "symlink" | "copy";
  reason?: string;
}

export interface SkillMirrorState {
  path: string;
  mode: "symlink" | "copy" | "missing" | "conflict";
  target?: string;
  expectedTarget?: string;
}
```

Edit the existing `Manifest` interface (line 3) to add the optional `skills` field as shown above.

- [ ] **Step 3: Update manifest schema in `standard.ts`**

In `packages/templates/src/standard.ts`, the `MANIFEST_SCHEMA` constant lists permitted manifest properties. Add `skills` to `properties` and to `additionalProperties: false`:

```typescript
properties: {
  $schema: { type: "string" },
  version: { const: 1 },
  modulesDir: { type: "string", minLength: 1 },
  scopesFile: { type: "string", minLength: 1 },
  claudeOutput: { type: "string", minLength: 1 },
  targets: {
    type: "object",
    minProperties: 1,
    required: ["root"],
    additionalProperties: { type: "string", minLength: 1 },
  },
  skills: {
    type: "object",
    additionalProperties: false,
    required: ["source", "mirrors"],
    properties: {
      source: { type: "string", minLength: 1 },
      mirrors: {
        type: "array",
        minItems: 1,
        items: { type: "string", minLength: 1 },
      },
      metaSkill: { type: "boolean" },
    },
  },
},
```

- [ ] **Step 4: Run typecheck to verify types compile**

Run: `pnpm --filter @timothycrooker/ai-context-core typecheck`
Expected: PASS (only type additions, no callsites changed).

- [ ] **Step 5: Commit**

```bash
cd ~/ai-context-kit
git add packages/core/src/types.ts packages/core/src/errors.ts packages/templates/src/standard.ts
git commit -m "feat(core,templates): add skill types, error codes, manifest schema field"
```

---

## Phase B — Skill discovery (TDD)

### Task 2: Skill frontmatter parser and validator

**Files:**
- Create: `packages/core/src/skills.ts`
- Create: `packages/core/test/skills-frontmatter.test.ts`

- [ ] **Step 1: Write failing tests for `parseSkillFrontmatter`**

Create `packages/core/test/skills-frontmatter.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseSkillFrontmatter } from "../src/skills.js";

describe("parseSkillFrontmatter", () => {
  it("parses minimum valid frontmatter", () => {
    const raw = "---\nname: demo\ndescription: A demo skill\n---\n\n# Body\n";
    const result = parseSkillFrontmatter(raw, "demo", "/x/demo/SKILL.md");
    expect(result.name).toBe("demo");
    expect(result.description).toBe("A demo skill");
  });

  it("accepts optional fields including scope array", () => {
    const raw =
      "---\nname: api-conv\ndescription: API conventions\nscope: [api, web]\nlicense: MIT\n---\n\nbody\n";
    const result = parseSkillFrontmatter(raw, "api-conv", "/x/api-conv/SKILL.md");
    expect(result.scope).toEqual(["api", "web"]);
    expect(result.license).toBe("MIT");
  });

  it("rejects when name does not match directory name", () => {
    const raw = "---\nname: wrong\ndescription: Mismatch\n---\nbody\n";
    expect(() => parseSkillFrontmatter(raw, "demo", "/x/demo/SKILL.md")).toThrow(
      /name 'wrong' does not match directory 'demo'/
    );
  });

  it("rejects invalid name pattern", () => {
    const raw = "---\nname: Bad_Name\ndescription: x\n---\nbody\n";
    expect(() => parseSkillFrontmatter(raw, "Bad_Name", "/x/Bad_Name/SKILL.md")).toThrow(
      /invalid name pattern/
    );
  });

  it("rejects missing description", () => {
    const raw = "---\nname: demo\n---\nbody\n";
    expect(() => parseSkillFrontmatter(raw, "demo", "/x/demo/SKILL.md")).toThrow(
      /description is required/
    );
  });

  it("rejects description over 1024 chars", () => {
    const longDesc = "x".repeat(1025);
    const raw = `---\nname: demo\ndescription: ${longDesc}\n---\nbody\n`;
    expect(() => parseSkillFrontmatter(raw, "demo", "/x/demo/SKILL.md")).toThrow(
      /description.*1024/
    );
  });

  it("rejects non-string scope entries", () => {
    const raw = "---\nname: demo\ndescription: x\nscope: [1, 2]\n---\nbody\n";
    expect(() => parseSkillFrontmatter(raw, "demo", "/x/demo/SKILL.md")).toThrow(
      /scope.*string/
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-frontmatter`
Expected: FAIL — `parseSkillFrontmatter` does not exist.

- [ ] **Step 3: Implement `parseSkillFrontmatter`**

Create `packages/core/src/skills.ts`:

```typescript
import { ContextError } from "./errors.js";
import { parseFrontMatter } from "./front-matter.js";
import type { SkillFrontmatter } from "./types.js";

const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

export function parseSkillFrontmatter(
  raw: string,
  expectedName: string,
  sourcePath: string
): SkillFrontmatter {
  const { meta } = parseFrontMatter(raw, sourcePath);

  const name = meta.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new ContextError(
      "AICTX_SKILL_FRONTMATTER_INVALID",
      `Skill name is required in ${sourcePath}`
    );
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ContextError(
      "AICTX_SKILL_NAME_INVALID",
      `Skill name '${name}' exceeds ${MAX_NAME_LENGTH} chars (${sourcePath})`
    );
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new ContextError(
      "AICTX_SKILL_NAME_INVALID",
      `Skill '${name}' has invalid name pattern in ${sourcePath} (must be [a-z0-9-], no leading/trailing/consecutive hyphens)`
    );
  }
  if (name !== expectedName) {
    throw new ContextError(
      "AICTX_SKILL_NAME_INVALID",
      `Skill name '${name}' does not match directory '${expectedName}' in ${sourcePath}`
    );
  }

  const description = meta.description;
  if (typeof description !== "string" || description.length === 0) {
    throw new ContextError(
      "AICTX_SKILL_FRONTMATTER_INVALID",
      `Skill description is required in ${sourcePath}`
    );
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ContextError(
      "AICTX_SKILL_FRONTMATTER_INVALID",
      `Skill description exceeds ${MAX_DESCRIPTION_LENGTH} chars in ${sourcePath}`
    );
  }

  let scope: string[] | undefined;
  if (meta.scope !== undefined) {
    if (!Array.isArray(meta.scope)) {
      throw new ContextError(
        "AICTX_SKILL_FRONTMATTER_INVALID",
        `Skill scope must be an array in ${sourcePath}`
      );
    }
    for (const entry of meta.scope) {
      if (typeof entry !== "string") {
        throw new ContextError(
          "AICTX_SKILL_FRONTMATTER_INVALID",
          `Skill scope entries must be strings in ${sourcePath}`
        );
      }
    }
    scope = meta.scope as string[];
  }

  return {
    ...(meta as Record<string, unknown>),
    name,
    description,
    scope,
  } as SkillFrontmatter;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-frontmatter`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/skills.ts packages/core/test/skills-frontmatter.test.ts
git commit -m "feat(core): add skill frontmatter parser per agentskills.io spec"
```

---

### Task 3: Skill source discovery from `.ai/skills/`

**Files:**
- Modify: `packages/core/src/skills.ts`
- Create: `packages/core/test/skills-discovery.test.ts`

- [ ] **Step 1: Write failing tests for `discoverSkills`**

Create `packages/core/test/skills-discovery.test.ts`:

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverSkills } from "../src/skills.js";

describe("discoverSkills", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-skills-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function writeSkill(name: string, frontmatter: string): void {
    const dir = path.join(tmp, ".ai/skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\nbody\n`, "utf8");
  }

  it("returns empty list when source dir does not exist", () => {
    const skills = discoverSkills(tmp, ".ai/skills");
    expect(skills).toEqual([]);
  });

  it("discovers skills with SKILL.md files", () => {
    writeSkill("alpha", "name: alpha\ndescription: First");
    writeSkill("beta", "name: beta\ndescription: Second");

    const skills = discoverSkills(tmp, ".ai/skills");
    expect(skills.map((s) => s.name).sort()).toEqual(["alpha", "beta"]);
    expect(skills[0].dir).toBe(path.join(tmp, ".ai/skills/alpha"));
    expect(skills[0].skillMdPath).toBe(path.join(tmp, ".ai/skills/alpha/SKILL.md"));
    expect(skills[0].frontmatter.description).toBe("First");
  });

  it("errors when a skill directory lacks SKILL.md", () => {
    fs.mkdirSync(path.join(tmp, ".ai/skills/incomplete"), { recursive: true });
    expect(() => discoverSkills(tmp, ".ai/skills")).toThrow(/SKILL\.md not found/);
  });

  it("propagates frontmatter validation errors with file context", () => {
    writeSkill("invalid", "name: wrong\ndescription: x");
    expect(() => discoverSkills(tmp, ".ai/skills")).toThrow(/does not match directory 'invalid'/);
  });

  it("ignores hidden directories like .DS_Store-style", () => {
    fs.mkdirSync(path.join(tmp, ".ai/skills/.hidden"), { recursive: true });
    writeSkill("visible", "name: visible\ndescription: x");
    const skills = discoverSkills(tmp, ".ai/skills");
    expect(skills.map((s) => s.name)).toEqual(["visible"]);
  });

  it("does not recurse into nested directories beyond depth 1", () => {
    writeSkill("alpha", "name: alpha\ndescription: x");
    const nested = path.join(tmp, ".ai/skills/alpha/references/sub");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, "SKILL.md"),
      "---\nname: sub\ndescription: y\n---\nbody\n",
      "utf8"
    );
    const skills = discoverSkills(tmp, ".ai/skills");
    expect(skills.map((s) => s.name)).toEqual(["alpha"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-discovery`
Expected: FAIL — `discoverSkills` does not exist.

- [ ] **Step 3: Implement `discoverSkills` in `skills.ts`**

Append to `packages/core/src/skills.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { readUtf8 } from "./io.js";
import type { SkillSource } from "./types.js";

export function discoverSkills(cwd: string, sourceDir: string): SkillSource[] {
  const absSourceDir = path.isAbsolute(sourceDir) ? sourceDir : path.join(cwd, sourceDir);
  if (!fs.existsSync(absSourceDir)) {
    return [];
  }

  const entries = fs.readdirSync(absSourceDir, { withFileTypes: true });
  const results: SkillSource[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const dir = path.join(absSourceDir, entry.name);
    const skillMdPath = path.join(dir, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) {
      throw new ContextError(
        "AICTX_SKILL_MISSING_FILE",
        `SKILL.md not found in ${dir}`
      );
    }

    const raw = readUtf8(skillMdPath);
    const frontmatter = parseSkillFrontmatter(raw, entry.name, skillMdPath);

    results.push({ name: entry.name, dir, skillMdPath, frontmatter });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}
```

Add `import fs from "node:fs"` and `import path from "node:path"` at the top of `skills.ts` if not already present.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-discovery`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/skills.ts packages/core/test/skills-discovery.test.ts
git commit -m "feat(core): discover skills from .ai/skills/ source directory"
```

---

### Task 4: Manifest skills block loading + scope ID validation

**Files:**
- Modify: `packages/core/src/config.ts`
- Modify: `packages/core/test/config.test.ts`

- [ ] **Step 1: Look at existing `loadManifest` in config.ts to understand pattern**

Read `packages/core/src/config.ts` to find the `loadManifest` function and identify where manifest schema validation happens. Skill block validation extends this same flow.

- [ ] **Step 2: Write failing tests for manifest skills block**

Append to `packages/core/test/config.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- config`
Expected: FAIL on the 5 new cases — `manifest.skills` not parsed yet.

- [ ] **Step 4: Extend `loadManifest` in `config.ts`**

In `packages/core/src/config.ts`, find where `loadManifest` parses and validates manifest fields. After the existing `targets` validation, add skills validation:

```typescript
// In loadManifest, after existing field validations:
const skillsRaw = (parsed as Record<string, unknown>).skills;
let skills: SkillsManifestBlock | undefined;
if (skillsRaw !== undefined) {
  if (!skillsRaw || typeof skillsRaw !== "object") {
    throw new ContextError(
      "AICTX_CONFIG_INVALID",
      `manifest.skills must be an object (${manifestPath})`
    );
  }
  const block = skillsRaw as Record<string, unknown>;
  if (typeof block.source !== "string" || block.source.length === 0) {
    throw new ContextError(
      "AICTX_CONFIG_INVALID",
      `manifest.skills.source is required (${manifestPath})`
    );
  }
  if (!Array.isArray(block.mirrors) || block.mirrors.length === 0) {
    throw new ContextError(
      "AICTX_CONFIG_INVALID",
      `manifest.skills.mirrors must be a non-empty array — at least one mirror path required (${manifestPath})`
    );
  }
  for (const mirror of block.mirrors) {
    if (typeof mirror !== "string" || mirror.length === 0) {
      throw new ContextError(
        "AICTX_CONFIG_INVALID",
        `manifest.skills.mirrors entries must be non-empty strings (${manifestPath})`
      );
    }
  }
  const metaSkill = block.metaSkill === undefined ? true : Boolean(block.metaSkill);
  skills = {
    source: block.source,
    mirrors: block.mirrors as string[],
    metaSkill,
  };
}

// Then include `skills` in the returned manifest:
return {
  version: 1,
  modulesDir,
  scopesFile,
  targets,
  claudeOutput,
  skills,
};
```

Add `SkillsManifestBlock` to the import from `./types.js` at the top of `config.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- config`
Expected: PASS (all existing tests + 5 new).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/config.ts packages/core/test/config.test.ts
git commit -m "feat(core): load and validate manifest.skills block"
```

---

## Phase C — Mirror engine (TDD)

### Task 5: Pure function: compute relative symlink target

**Files:**
- Modify: `packages/core/src/skills.ts`
- Create: `packages/core/test/skills-symlink-path.test.ts`

- [ ] **Step 1: Write failing tests for `computeSymlinkTarget`**

Create `packages/core/test/skills-symlink-path.test.ts`:

```typescript
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
    // Use forward slashes throughout — Node's path.relative on POSIX returns forward slashes.
    // This test asserts we never emit backslashes in symlink targets regardless of platform.
    const result = computeSymlinkTarget("/repo/.agents/skills/x", "/repo/.ai/skills/x");
    expect(result).not.toContain("\\");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-symlink-path`
Expected: FAIL — `computeSymlinkTarget` does not exist.

- [ ] **Step 3: Implement `computeSymlinkTarget`**

Append to `packages/core/src/skills.ts`:

```typescript
import { toPosix } from "./path-utils.js";

export function computeSymlinkTarget(mirrorPath: string, sourcePath: string): string {
  const relative = path.relative(path.dirname(mirrorPath), sourcePath);
  return toPosix(relative);
}
```

(Verify `toPosix` exists in `path-utils.ts` per the architecture report; if not, add it as `export const toPosix = (p: string) => p.split(path.sep).join("/")`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-symlink-path`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/skills.ts packages/core/test/skills-symlink-path.test.ts
git commit -m "feat(core): pure function to compute relative symlink targets"
```

---

### Task 6: Create directory symlink with conflict detection

**Files:**
- Modify: `packages/core/src/skills.ts`
- Modify: `packages/core/src/io.ts`
- Create: `packages/core/test/skills-create-mirror.test.ts`

- [ ] **Step 1: Add symlink helpers to `io.ts`**

Append to `packages/core/src/io.ts`:

```typescript
export function symlinkExists(linkPath: string): boolean {
  try {
    fs.lstatSync(linkPath);
    return true;
  } catch {
    return false;
  }
}

export function readSymlink(linkPath: string): string | null {
  try {
    return fs.readlinkSync(linkPath);
  } catch {
    return null;
  }
}

export function isSymlink(linkPath: string): boolean {
  try {
    return fs.lstatSync(linkPath).isSymbolicLink();
  } catch {
    return false;
  }
}

export function createSymlink(target: string, linkPath: string): void {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath, "dir");
}

export function removeSymlink(linkPath: string): void {
  if (isSymlink(linkPath)) {
    fs.unlinkSync(linkPath);
  }
}
```

- [ ] **Step 2: Write failing tests for `createMirrorSymlink`**

Create `packages/core/test/skills-create-mirror.test.ts`:

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMirrorSymlink } from "../src/skills.js";

describe("createMirrorSymlink", () => {
  let tmp: string;
  let sourceDir: string;
  let mirrorPath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-mirror-"));
    sourceDir = path.join(tmp, ".ai/skills/demo");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, "SKILL.md"),
      "---\nname: demo\ndescription: x\n---\nbody\n"
    );
    mirrorPath = path.join(tmp, ".agents/skills/demo");
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("creates a symlink pointing at the source via relative path", () => {
    createMirrorSymlink(sourceDir, mirrorPath);
    const stat = fs.lstatSync(mirrorPath);
    expect(stat.isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(mirrorPath)).toBe("../../.ai/skills/demo");
  });

  it("makes source content visible through the symlink path", () => {
    createMirrorSymlink(sourceDir, mirrorPath);
    const content = fs.readFileSync(path.join(mirrorPath, "SKILL.md"), "utf8");
    expect(content).toContain("name: demo");
  });

  it("is idempotent when the correct symlink already exists", () => {
    createMirrorSymlink(sourceDir, mirrorPath);
    expect(() => createMirrorSymlink(sourceDir, mirrorPath)).not.toThrow();
    expect(fs.readlinkSync(mirrorPath)).toBe("../../.ai/skills/demo");
  });

  it("repairs a symlink that points at the wrong target", () => {
    fs.mkdirSync(path.dirname(mirrorPath), { recursive: true });
    fs.symlinkSync("../../.ai/skills/somewhere-else", mirrorPath, "dir");
    createMirrorSymlink(sourceDir, mirrorPath);
    expect(fs.readlinkSync(mirrorPath)).toBe("../../.ai/skills/demo");
  });

  it("throws SKILL_MIRROR_CONFLICT when a real directory exists at the mirror path", () => {
    fs.mkdirSync(mirrorPath, { recursive: true });
    fs.writeFileSync(path.join(mirrorPath, "SKILL.md"), "user content");
    expect(() => createMirrorSymlink(sourceDir, mirrorPath)).toThrow(
      /AICTX_SKILL_MIRROR_CONFLICT/
    );
  });

  it("throws SKILL_MIRROR_CONFLICT when a regular file exists at the mirror path", () => {
    fs.mkdirSync(path.dirname(mirrorPath), { recursive: true });
    fs.writeFileSync(mirrorPath, "junk");
    expect(() => createMirrorSymlink(sourceDir, mirrorPath)).toThrow(
      /AICTX_SKILL_MIRROR_CONFLICT/
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-create-mirror`
Expected: FAIL — `createMirrorSymlink` does not exist.

- [ ] **Step 4: Implement `createMirrorSymlink` in `skills.ts`**

Append to `packages/core/src/skills.ts`:

```typescript
import { createSymlink, isSymlink, readSymlink, removeSymlink } from "./io.js";

export function createMirrorSymlink(sourceDir: string, mirrorPath: string): void {
  const expectedTarget = computeSymlinkTarget(mirrorPath, sourceDir);

  if (fs.existsSync(mirrorPath) || isSymlink(mirrorPath)) {
    if (isSymlink(mirrorPath)) {
      const current = readSymlink(mirrorPath);
      if (current === expectedTarget) {
        return; // idempotent
      }
      removeSymlink(mirrorPath);
    } else {
      throw new ContextError(
        "AICTX_SKILL_MIRROR_CONFLICT",
        `Cannot create skill mirror at ${mirrorPath}: a real file or directory exists there. Either delete it or move skill source elsewhere.`
      );
    }
  }

  createSymlink(expectedTarget, mirrorPath);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-create-mirror`
Expected: PASS (all 6 cases).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/io.ts packages/core/src/skills.ts packages/core/test/skills-create-mirror.test.ts
git commit -m "feat(core): create skill mirror symlinks with conflict detection"
```

---

### Task 7: Windows / no-symlink copy fallback

**Files:**
- Modify: `packages/core/src/skills.ts`
- Modify: `packages/core/src/io.ts`
- Create: `packages/core/test/skills-copy-fallback.test.ts`

- [ ] **Step 1: Add recursive copy helper to `io.ts`**

Append to `packages/core/src/io.ts`:

```typescript
export function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      const mode = fs.statSync(srcPath).mode;
      fs.chmodSync(destPath, mode);
    }
  }
}

export function restoreExecBits(dir: string): void {
  const EXEC_EXT = new Set([".sh", ".bash", ".zsh", ".py", ".rb"]);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      restoreExecBits(full);
    } else if (entry.isFile() && EXEC_EXT.has(path.extname(entry.name))) {
      const mode = fs.statSync(full).mode;
      fs.chmodSync(full, mode | 0o111);
    }
  }
}
```

- [ ] **Step 2: Write failing tests for `createMirrorCopy`**

Create `packages/core/test/skills-copy-fallback.test.ts`:

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMirrorCopy } from "../src/skills.js";

describe("createMirrorCopy", () => {
  let tmp: string;
  let sourceDir: string;
  let mirrorPath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-copy-"));
    sourceDir = path.join(tmp, ".ai/skills/demo");
    fs.mkdirSync(path.join(sourceDir, "references"), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, "SKILL.md"),
      "---\nname: demo\ndescription: x\n---\nbody\n"
    );
    fs.writeFileSync(path.join(sourceDir, "references/notes.md"), "notes");
    fs.writeFileSync(path.join(sourceDir, "scripts/run.sh"), "#!/bin/bash\n");
    mirrorPath = path.join(tmp, ".agents/skills/demo");
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("recursively copies the source directory tree", () => {
    createMirrorCopy(sourceDir, mirrorPath);
    expect(fs.existsSync(path.join(mirrorPath, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(mirrorPath, "references/notes.md"))).toBe(true);
    expect(fs.existsSync(path.join(mirrorPath, "scripts/run.sh"))).toBe(true);
  });

  it("prepends a _generated banner to the copied SKILL.md", () => {
    createMirrorCopy(sourceDir, mirrorPath);
    const copied = fs.readFileSync(path.join(mirrorPath, "SKILL.md"), "utf8");
    expect(copied.startsWith("<!-- _generated: do not edit here.")).toBe(true);
    expect(copied).toContain("Source: .ai/skills/demo/SKILL.md");
  });

  it("preserves the original frontmatter after the banner", () => {
    createMirrorCopy(sourceDir, mirrorPath);
    const copied = fs.readFileSync(path.join(mirrorPath, "SKILL.md"), "utf8");
    expect(copied).toContain("name: demo");
    expect(copied).toContain("description: x");
  });

  it("sets exec bit on .sh files (POSIX only)", () => {
    if (process.platform === "win32") return;
    createMirrorCopy(sourceDir, mirrorPath);
    const mode = fs.statSync(path.join(mirrorPath, "scripts/run.sh")).mode;
    expect(mode & 0o111).not.toBe(0);
  });

  it("overwrites existing copy mirror without complaint", () => {
    createMirrorCopy(sourceDir, mirrorPath);
    fs.writeFileSync(path.join(sourceDir, "SKILL.md"), "---\nname: demo\ndescription: v2\n---\nbody\n");
    createMirrorCopy(sourceDir, mirrorPath);
    const copied = fs.readFileSync(path.join(mirrorPath, "SKILL.md"), "utf8");
    expect(copied).toContain("description: v2");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-copy-fallback`
Expected: FAIL — `createMirrorCopy` does not exist.

- [ ] **Step 4: Implement `createMirrorCopy`**

Append to `packages/core/src/skills.ts`:

```typescript
import { copyDirRecursive, restoreExecBits, writeUtf8, readUtf8 } from "./io.js";

const COPY_BANNER_PREFIX = "<!-- _generated: do not edit here.";

export function createMirrorCopy(sourceDir: string, mirrorPath: string, repoRoot?: string): void {
  if (fs.existsSync(mirrorPath)) {
    fs.rmSync(mirrorPath, { recursive: true, force: true });
  }
  copyDirRecursive(sourceDir, mirrorPath);
  restoreExecBits(mirrorPath);

  const skillMdPath = path.join(mirrorPath, "SKILL.md");
  const relSource = repoRoot
    ? path.relative(repoRoot, path.join(sourceDir, "SKILL.md"))
    : path.relative(path.dirname(mirrorPath), path.join(sourceDir, "SKILL.md"));
  const body = readUtf8(skillMdPath);
  const banner = `${COPY_BANNER_PREFIX} Source: ${toPosix(relSource)} -->\n`;
  writeUtf8(skillMdPath, banner + body);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-copy-fallback`
Expected: PASS (all 5 cases).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/io.ts packages/core/src/skills.ts packages/core/test/skills-copy-fallback.test.ts
git commit -m "feat(core): copy-fallback for skill mirrors on no-symlink filesystems"
```

---

### Task 8: Mirror plan computation with scope expansion

**Files:**
- Modify: `packages/core/src/skills.ts`
- Create: `packages/core/test/skills-plan.test.ts`

- [ ] **Step 1: Write failing tests for `planSkillMirrors`**

Create `packages/core/test/skills-plan.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { planSkillMirrors } from "../src/skills.js";
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
    expect(() => planSkillMirrors("/repo", manifest, [skill("bad", ["nonexistent"])])).toThrow(
      /AICTX_SKILL_SCOPE_UNKNOWN/
    );
  });

  it("returns empty plan when manifest.skills is undefined", () => {
    const manifestNoSkills: Manifest = { ...manifest, skills: undefined };
    expect(planSkillMirrors("/repo", manifestNoSkills, [skill("plain")])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-plan`
Expected: FAIL — `planSkillMirrors` does not exist.

- [ ] **Step 3: Implement `planSkillMirrors`**

Append to `packages/core/src/skills.ts`:

```typescript
import type { Manifest, SkillMirrorPlan, SkillSource } from "./types.js";

export function planSkillMirrors(
  repoRoot: string,
  manifest: Manifest,
  skills: SkillSource[]
): SkillMirrorPlan[] {
  if (!manifest.skills) return [];

  const targetIds = Object.keys(manifest.targets);
  const scopeTargets = Object.fromEntries(
    Object.entries(manifest.targets)
      .filter(([id]) => id !== "root")
      .map(([id, agentsPath]) => [id, path.posix.dirname(agentsPath.split(path.sep).join("/"))])
  );

  const plans: SkillMirrorPlan[] = [];

  for (const skill of skills) {
    const scope = skill.frontmatter.scope ?? [];
    const explicitWildcard = scope.includes("*");
    const scopeIds = explicitWildcard
      ? targetIds.filter((id) => id !== "root")
      : scope;

    for (const scopeId of scopeIds) {
      if (scopeId === "*") continue;
      if (!targetIds.includes(scopeId)) {
        throw new ContextError(
          "AICTX_SKILL_SCOPE_UNKNOWN",
          `Skill '${skill.name}' references undefined scope '${scopeId}'`
        );
      }
    }

    // Determine emission roots
    const emissionRoots: string[] = [];
    if (scope.length === 0 || explicitWildcard) {
      emissionRoots.push(repoRoot);
    }
    if (explicitWildcard) {
      for (const id of targetIds) {
        if (id === "root") continue;
        emissionRoots.push(path.join(repoRoot, scopeTargets[id]));
      }
    } else {
      for (const id of scope) {
        if (id === "*") continue;
        emissionRoots.push(path.join(repoRoot, scopeTargets[id]));
      }
    }

    for (const root of emissionRoots) {
      for (const mirror of manifest.skills.mirrors) {
        plans.push({
          source: skill.dir,
          mirror: path.join(root, mirror, skill.name),
          mode: "symlink",
        });
      }
    }
  }

  return plans;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-plan`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/skills.ts packages/core/test/skills-plan.test.ts
git commit -m "feat(core): plan skill mirror emissions with scope expansion"
```

---

### Task 9: Apply skill mirror plan with symlink + fallback orchestration

**Files:**
- Modify: `packages/core/src/skills.ts`
- Create: `packages/core/test/skills-apply.test.ts`

- [ ] **Step 1: Write failing tests for `applySkillMirrors`**

Create `packages/core/test/skills-apply.test.ts`:

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applySkillMirrors } from "../src/skills.js";
import type { SkillMirrorPlan } from "../src/types.js";

describe("applySkillMirrors", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-apply-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function makeSource(name: string): string {
    const dir = path.join(tmp, ".ai/skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: x\n---\nbody\n`);
    return dir;
  }

  it("creates symlinks for every plan entry", () => {
    const sourceA = makeSource("alpha");
    const sourceB = makeSource("beta");
    const plans: SkillMirrorPlan[] = [
      { source: sourceA, mirror: path.join(tmp, ".agents/skills/alpha"), mode: "symlink" },
      { source: sourceA, mirror: path.join(tmp, ".claude/skills/alpha"), mode: "symlink" },
      { source: sourceB, mirror: path.join(tmp, ".agents/skills/beta"), mode: "symlink" },
    ];
    const result = applySkillMirrors(plans, { forceCopy: false });
    expect(result.written).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    expect(fs.lstatSync(plans[0].mirror).isSymbolicLink()).toBe(true);
  });

  it("falls back to copy when forceCopy is true", () => {
    const source = makeSource("alpha");
    const mirror = path.join(tmp, ".agents/skills/alpha");
    const plans: SkillMirrorPlan[] = [{ source, mirror, mode: "symlink" }];
    const result = applySkillMirrors(plans, { forceCopy: true, repoRoot: tmp });
    expect(result.fallbackToCopy).toHaveLength(1);
    expect(fs.lstatSync(mirror).isSymbolicLink()).toBe(false);
    expect(fs.statSync(mirror).isDirectory()).toBe(true);
    const skillMd = fs.readFileSync(path.join(mirror, "SKILL.md"), "utf8");
    expect(skillMd).toContain("<!-- _generated:");
  });

  it("records failures with their reasons rather than throwing", () => {
    const source = makeSource("alpha");
    const mirror = path.join(tmp, ".agents/skills/alpha");
    // Create a conflicting real directory
    fs.mkdirSync(mirror, { recursive: true });
    fs.writeFileSync(path.join(mirror, "user.txt"), "stuff");
    const plans: SkillMirrorPlan[] = [{ source, mirror, mode: "symlink" }];
    const result = applySkillMirrors(plans, { forceCopy: false });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toMatch(/AICTX_SKILL_MIRROR_CONFLICT/);
    expect(result.written).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-apply`
Expected: FAIL — `applySkillMirrors` does not exist.

- [ ] **Step 3: Implement `applySkillMirrors`**

Append to `packages/core/src/skills.ts`:

```typescript
export interface ApplyMirrorOptions {
  forceCopy?: boolean;
  repoRoot?: string;
}

export interface ApplyMirrorResult {
  written: SkillMirrorPlan[];
  fallbackToCopy: SkillMirrorPlan[];
  failed: { plan: SkillMirrorPlan; reason: string }[];
}

export function applySkillMirrors(
  plans: SkillMirrorPlan[],
  options: ApplyMirrorOptions = {}
): ApplyMirrorResult {
  const written: SkillMirrorPlan[] = [];
  const fallbackToCopy: SkillMirrorPlan[] = [];
  const failed: { plan: SkillMirrorPlan; reason: string }[] = [];

  const forceFallback =
    options.forceCopy === true || process.env.AI_CONTEXT_FORCE_COPY_FALLBACK === "1";

  for (const plan of plans) {
    try {
      if (forceFallback) {
        createMirrorCopy(plan.source, plan.mirror, options.repoRoot);
        fallbackToCopy.push({ ...plan, mode: "copy" });
        continue;
      }

      try {
        createMirrorSymlink(plan.source, plan.mirror);
        written.push(plan);
      } catch (error) {
        if (error instanceof ContextError && error.code === "AICTX_SKILL_MIRROR_CONFLICT") {
          throw error;
        }
        // Symlink permission errors → fall back to copy
        createMirrorCopy(plan.source, plan.mirror, options.repoRoot);
        fallbackToCopy.push({ ...plan, mode: "copy" });
      }
    } catch (error) {
      const reason =
        error instanceof ContextError ? `[${error.code}] ${error.message}` : String(error);
      failed.push({ plan, reason });
    }
  }

  return { written, fallbackToCopy, failed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-apply`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/skills.ts packages/core/test/skills-apply.test.ts
git commit -m "feat(core): orchestrate skill mirror application with copy fallback"
```

---

### Task 10: Mirror orphan removal

**Files:**
- Modify: `packages/core/src/skills.ts`
- Create: `packages/core/test/skills-orphans.test.ts`

- [ ] **Step 1: Write failing tests for `findOrphanedSkillMirrors`**

Create `packages/core/test/skills-orphans.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-orphans`
Expected: FAIL — `findOrphanedSkillMirrors` does not exist.

- [ ] **Step 3: Implement `findOrphanedSkillMirrors`**

Append to `packages/core/src/skills.ts`:

```typescript
export function findOrphanedSkillMirrors(
  repoRoot: string,
  manifest: Manifest,
  activeSkillNames: string[]
): string[] {
  if (!manifest.skills) return [];

  const active = new Set(activeSkillNames);
  const orphans: string[] = [];

  const mirrorBases: string[] = [];
  // Root mirrors
  for (const m of manifest.skills.mirrors) {
    mirrorBases.push(path.join(repoRoot, m));
  }
  // Per-scope mirrors
  for (const [id, agentsPath] of Object.entries(manifest.targets)) {
    if (id === "root") continue;
    const scopeRoot = path.join(repoRoot, path.dirname(agentsPath));
    for (const m of manifest.skills.mirrors) {
      mirrorBases.push(path.join(scopeRoot, m));
    }
  }

  for (const base of mirrorBases) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      const full = path.join(base, entry.name);
      if (!isSymlink(full)) continue; // only kit-managed entries are symlinks
      if (!active.has(entry.name)) {
        orphans.push(full);
      }
    }
  }

  return orphans.sort();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- skills-orphans`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/skills.ts packages/core/test/skills-orphans.test.ts
git commit -m "feat(core): detect orphaned skill mirrors for cleanup"
```

---

## Phase D — Engine integration

### Task 11: Wire skills into `buildInternal`

**Files:**
- Modify: `packages/core/src/engine.ts`
- Modify: `packages/core/src/index.ts` (re-exports)
- Create: `packages/core/test/engine-skills.test.ts`

- [ ] **Step 1: Re-export skill functions from `index.ts`**

In `packages/core/src/index.ts`, add re-exports for the skill module so `engine.ts` and consumers can import:

```typescript
export {
  parseSkillFrontmatter,
  discoverSkills,
  planSkillMirrors,
  applySkillMirrors,
  findOrphanedSkillMirrors,
  createMirrorSymlink,
  createMirrorCopy,
  computeSymlinkTarget,
} from "./skills.js";
```

- [ ] **Step 2: Write failing integration test for build with skills**

Create `packages/core/test/engine-skills.test.ts`:

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAll } from "../src/engine.js";

describe("buildAll with skills", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-engine-skills-"));
    fs.mkdirSync(path.join(tmp, ".ai/context"), { recursive: true });
    fs.mkdirSync(path.join(tmp, ".ai/context/modules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/modules/010-overview.md"),
      "---\nid: overview\ntargets: [root]\norder: 10\n---\n\n# Overview\n\nSome content.\n"
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
        skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"] },
      })
    );
    fs.mkdirSync(path.join(tmp, ".ai/skills/demo"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/skills/demo/SKILL.md"),
      "---\nname: demo\ndescription: A demo\n---\n\n# Demo\n"
    );
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("creates skill mirrors during build", () => {
    buildAll(tmp);
    expect(fs.lstatSync(path.join(tmp, ".agents/skills/demo")).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(tmp, ".claude/skills/demo")).isSymbolicLink()).toBe(true);
  });

  it("skipping skills entirely when manifest.skills is absent", () => {
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
      })
    );
    buildAll(tmp);
    expect(fs.existsSync(path.join(tmp, ".agents/skills/demo"))).toBe(false);
    expect(fs.existsSync(path.join(tmp, ".claude/skills/demo"))).toBe(false);
  });

  it("removes orphaned mirrors with --remove-orphans flag", () => {
    buildAll(tmp);
    // Delete the source
    fs.rmSync(path.join(tmp, ".ai/skills/demo"), { recursive: true });
    buildAll(tmp, { removeOrphans: true });
    expect(fs.existsSync(path.join(tmp, ".agents/skills/demo"))).toBe(false);
  });

  it("--check fails when source exists but mirror is missing", () => {
    expect(() => buildAll(tmp, { check: true })).not.toThrow();
    // First build creates mirrors. Now remove one and rebuild --check.
    fs.unlinkSync(path.join(tmp, ".agents/skills/demo"));
    const result = buildAll(tmp, { check: true });
    expect(result.upToDate).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- engine-skills`
Expected: FAIL — `buildAll` does not yet process skills.

- [ ] **Step 4: Extend `buildInternal` in `engine.ts`**

In `packages/core/src/engine.ts`, modify `buildInternal` (~line 95) to process skills after the existing module output writing:

```typescript
import {
  applySkillMirrors,
  discoverSkills,
  findOrphanedSkillMirrors,
  planSkillMirrors,
} from "./skills.js";

function buildInternal(cwd: string, options: BuildOptions): BuildResult {
  const manifest = loadManifest(cwd, options.manifestPath);
  const scopeManifest = loadScopeManifest(cwd, manifest);
  const modules = loadModules(cwd, manifest);
  const wiring = validateScopeWiring(cwd, manifest, scopeManifest);
  const outputs = collectGeneratedOutputs(cwd, manifest, scopeManifest, modules);
  const result = writeOutputs(cwd, outputs, options);
  result.warnings.push(...wiring.warnings);

  // Skills processing (no-op when manifest.skills is undefined)
  if (manifest.skills) {
    const skills = discoverSkills(cwd, manifest.skills.source);
    const plans = planSkillMirrors(cwd, manifest, skills);
    const activeNames = skills.map((s) => s.name);
    const orphans = findOrphanedSkillMirrors(cwd, manifest, activeNames);

    if (!options.dryRun && !options.check) {
      const apply = applySkillMirrors(plans, { repoRoot: cwd });
      for (const plan of apply.written) {
        result.written.push(path.relative(cwd, plan.mirror));
      }
      for (const plan of apply.fallbackToCopy) {
        result.written.push(path.relative(cwd, plan.mirror));
        result.warnings.push(
          `Skill mirror at ${path.relative(cwd, plan.mirror)} used copy-fallback (no symlink support)`
        );
      }
      for (const fail of apply.failed) {
        result.warnings.push(`Skill mirror failed: ${fail.reason}`);
      }
      if (options.removeOrphans) {
        for (const orphan of orphans) {
          fs.unlinkSync(orphan);
          result.removed.push(path.relative(cwd, orphan));
        }
      }
    } else {
      // dry-run / check: predict what would change
      for (const plan of plans) {
        const exists = fs.existsSync(plan.mirror);
        if (!exists) {
          result.written.push(path.relative(cwd, plan.mirror));
          result.upToDate = false;
        }
      }
      for (const orphan of orphans) {
        if (options.removeOrphans) {
          result.removed.push(path.relative(cwd, orphan));
        }
      }
    }
  }

  return result;
}
```

Add `import fs from "node:fs"` at the top of `engine.ts` if not already present.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- engine-skills`
Expected: PASS (all 4 cases).

- [ ] **Step 6: Run full core test suite to confirm nothing broke**

Run: `pnpm --filter @timothycrooker/ai-context-core test`
Expected: PASS (all tests).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/engine.ts packages/core/src/index.ts packages/core/test/engine-skills.test.ts
git commit -m "feat(core): wire skill mirror processing into buildInternal"
```

---

### Task 12: Extend `verifyAll`, `diffGenerated`, `doctor`, `lintConfig` for skills

**Files:**
- Modify: `packages/core/src/engine.ts`
- Modify: `packages/core/test/engine.test.ts` (or create `engine-skills-verify.test.ts`)

- [ ] **Step 1: Write failing tests for verify/diff/doctor with skills**

Create `packages/core/test/engine-skills-verify.test.ts`:

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAll, diffGenerated, doctor, lintConfig, verifyAll } from "../src/engine.js";

function setup(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-verify-skills-"));
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
      skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"] },
    })
  );
  fs.mkdirSync(path.join(tmp, ".ai/skills/demo"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, ".ai/skills/demo/SKILL.md"),
    "---\nname: demo\ndescription: A demo skill\n---\n\nbody\n"
  );
  return tmp;
}

describe("skill engine integration: verify/diff/doctor/lintConfig", () => {
  let tmp: string;
  beforeEach(() => (tmp = setup()));
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("verifyAll fails when skill mirror is missing", () => {
    // Don't build — mirrors absent
    const result = verifyAll(tmp);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/skill|mirror/i);
  });

  it("verifyAll passes after build", () => {
    buildAll(tmp);
    const result = verifyAll(tmp);
    expect(result.ok).toBe(true);
  });

  it("diffGenerated reports missing skill mirrors as 'create'", () => {
    const report = diffGenerated(tmp);
    const skillItems = report.items.filter((i) => i.path.includes("skills/demo"));
    expect(skillItems.length).toBeGreaterThan(0);
    expect(skillItems.every((i) => i.type === "create")).toBe(true);
  });

  it("doctor reports broken skill mirrors", () => {
    buildAll(tmp);
    fs.rmSync(path.join(tmp, ".ai/skills/demo"), { recursive: true }); // break the symlink
    const result = doctor(tmp);
    expect(result.issues.join("\n")).toMatch(/skill|broken/i);
  });

  it("lintConfig errors on undefined scope reference", () => {
    fs.writeFileSync(
      path.join(tmp, ".ai/skills/demo/SKILL.md"),
      "---\nname: demo\ndescription: x\nscope: [nonexistent]\n---\nbody\n"
    );
    const result = lintConfig(tmp);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/AICTX_SKILL_SCOPE_UNKNOWN/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- engine-skills-verify`
Expected: FAIL — engine functions don't process skills for these flows yet.

- [ ] **Step 3: Extend `verifyAll` in `engine.ts`**

`verifyAll` already calls `buildInternal` with `check: true, dryRun: true` (lines 147–154). Since Task 11 made `buildInternal` populate `result.written` with predicted-new mirror paths under check mode, `verifyAll` will surface those as the "Generated outputs are out of date" error automatically. No additional change needed for the basic case.

For broken-symlink detection (a stronger check), add an explicit walk in `verifyAll` after the existing checks:

```typescript
// After existing budget checks in verifyAll:
const manifest = loadManifest(cwd, options.manifestPath);
if (manifest.skills) {
  const skills = discoverSkills(cwd, manifest.skills.source);
  const plans = planSkillMirrors(cwd, manifest, skills);
  for (const plan of plans) {
    if (!fs.existsSync(plan.mirror)) {
      errors.push(`Skill mirror missing: ${path.relative(cwd, plan.mirror)}`);
      continue;
    }
    if (isSymlink(plan.mirror)) {
      const target = readSymlink(plan.mirror);
      const expected = computeSymlinkTarget(plan.mirror, plan.source);
      if (target !== expected) {
        errors.push(
          `Skill mirror points at wrong target: ${path.relative(cwd, plan.mirror)} → ${target} (expected ${expected})`
        );
      }
    }
  }
}
```

Add the imports at the top of `engine.ts`:

```typescript
import { computeSymlinkTarget } from "./skills.js";
import { isSymlink, readSymlink } from "./io.js";
```

- [ ] **Step 4: Extend `diffGenerated` for skills**

In `diffGenerated` (around line 110 in `engine.ts`), after the existing module output diff, add skill-mirror diff:

```typescript
// After existing output diff:
if (manifest.skills) {
  const skills = discoverSkills(cwd, manifest.skills.source);
  const plans = planSkillMirrors(cwd, manifest, skills);
  for (const plan of plans) {
    const relPath = path.relative(cwd, plan.mirror);
    if (!fs.existsSync(plan.mirror)) {
      items.push({ path: relPath, type: "create" });
    } else if (isSymlink(plan.mirror)) {
      const target = readSymlink(plan.mirror);
      const expected = computeSymlinkTarget(plan.mirror, plan.source);
      if (target !== expected) {
        items.push({ path: relPath, type: "update" });
      }
    }
  }
  // Orphans
  const activeNames = skills.map((s) => s.name);
  for (const orphan of findOrphanedSkillMirrors(cwd, manifest, activeNames)) {
    items.push({ path: path.relative(cwd, orphan), type: "delete" });
  }
}
```

- [ ] **Step 5: Extend `doctor` to check skill mirror health**

Find the `doctor` function in `engine.ts`. After existing checks, add:

```typescript
// In doctor:
if (manifest.skills) {
  const skills = discoverSkills(cwd, manifest.skills.source);
  const plans = planSkillMirrors(cwd, manifest, skills);
  for (const plan of plans) {
    if (!fs.existsSync(plan.mirror)) {
      issues.push(`Skill mirror missing: ${path.relative(cwd, plan.mirror)}`);
      suggestions.push(`Run: ai-context build`);
      continue;
    }
    if (isSymlink(plan.mirror)) {
      const target = readSymlink(plan.mirror);
      const expected = computeSymlinkTarget(plan.mirror, plan.source);
      if (target !== expected) {
        issues.push(
          `Skill mirror points to wrong target: ${path.relative(cwd, plan.mirror)} (got ${target}, expected ${expected})`
        );
        suggestions.push(`Run: ai-context build`);
      }
    } else {
      // Real directory or copy fallback
      const skillMdPath = path.join(plan.mirror, "SKILL.md");
      if (fs.existsSync(skillMdPath)) {
        const content = fs.readFileSync(skillMdPath, "utf8");
        if (content.startsWith("<!-- _generated:")) {
          issues.push(
            `Skill mirror at ${path.relative(cwd, plan.mirror)} is a copy-fallback (no symlink support). To upgrade: enable Developer Mode + git config core.symlinks true + ai-context build`
          );
        }
      }
    }
  }
}
```

- [ ] **Step 6: Extend `lintConfig` for skill scope validation**

In `lintConfig` (~line 201 in `engine.ts`), after existing validation, add:

```typescript
// After existing lintConfig checks:
const manifest = loadManifest(cwd, manifestPath); // may already be loaded; reuse
if (manifest.skills) {
  try {
    const skills = discoverSkills(cwd, manifest.skills.source);
    // Triggers planSkillMirrors which validates scope IDs
    planSkillMirrors(cwd, manifest, skills);
  } catch (error) {
    errors.push(formatContextError(error));
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- engine-skills-verify`
Expected: PASS (all 5 cases).

- [ ] **Step 8: Run full core suite**

Run: `pnpm --filter @timothycrooker/ai-context-core test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/engine.ts packages/core/test/engine-skills-verify.test.ts
git commit -m "feat(core): extend verify/diff/doctor/lintConfig for skills"
```

---

## Phase E — Render: kit-awareness stanza

### Task 13: Add kit-awareness stanza to root AGENTS.md / CLAUDE.md when `manifest.skills` is present

**Files:**
- Modify: `packages/core/src/render.ts`
- Create: `packages/core/test/render-stanza.test.ts`

- [ ] **Step 1: Write failing tests for stanza emission**

Create `packages/core/test/render-stanza.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildRootAgents, buildClaudeRoot } from "../src/render.js";
import type { ContextModule, Manifest, ScopeManifest } from "../src/types.js";

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
const scopes: ScopeManifest = { version: 1, scopes: [] };

describe("kit-awareness stanza", () => {
  it("is absent from AGENTS.md when manifest.skills is undefined", () => {
    const out = buildRootAgents(baseManifest, scopes, modules, "AGENTS.md");
    expect(out).not.toContain("ai-context-kit");
    expect(out).not.toContain("Working in this repo");
  });

  it("is present in AGENTS.md when manifest.skills is defined", () => {
    const manifest: Manifest = {
      ...baseManifest,
      skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"], metaSkill: true },
    };
    const out = buildRootAgents(manifest, scopes, modules, "AGENTS.md");
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
    const out = buildClaudeRoot(manifest, scopes, modules, "CLAUDE.md");
    expect(out).toContain("ai-context-kit");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- render-stanza`
Expected: FAIL — stanza not emitted yet.

- [ ] **Step 3: Define the stanza constant and emit it**

In `packages/core/src/render.ts`, near the top, add:

```typescript
const KIT_AWARENESS_STANZA = `## Working in this repo

This repo's context and skills are managed by [ai-context-kit](https://github.com/TimCrooker/ai-context-kit). For authoring guidance, schema reference, or to add a new module/scope/skill, invoke the \`/ai-context-kit\` skill (or just ask about modules/scopes/skills — the skill auto-loads on those keywords).

Run \`ai-context build\` after editing anything under \`.ai/\`. Generated files are: AGENTS.md, CLAUDE.md, .claude/rules/*.md, .agents/skills/*, .claude/skills/*.

---
`;
```

Then find `buildRootAgents` and `buildClaudeRoot`. In each, after the existing GENERATED-FILE header but before the module body, conditionally emit the stanza:

```typescript
// In buildRootAgents (and similarly buildClaudeRoot):
const sections: string[] = [];
sections.push(headerComment); // existing
if (manifest.skills) {
  sections.push(KIT_AWARENESS_STANZA);
}
sections.push(modulesBody(modules, "root"));
return sections.join("\n");
```

The exact integration may need to match render.ts's existing string-building style — adjust to match.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @timothycrooker/ai-context-core test -- render-stanza`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Run full core suite to check existing snapshot tests aren't broken**

Run: `pnpm --filter @timothycrooker/ai-context-core test`
Expected: PASS. If existing snapshot tests expecting AGENTS.md content fail because of the new stanza, update them — but only if their fixture manifest has `skills` set. Fixtures without `skills` should still produce stanza-free output.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/render.ts packages/core/test/render-stanza.test.ts
git commit -m "feat(core): emit kit-awareness stanza in root AGENTS.md/CLAUDE.md"
```

---

## Phase F — CLI

### Task 14: Skills command group scaffolding

**Files:**
- Create: `packages/cli/src/commands/skills/index.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Create skills command group registrar**

Create `packages/cli/src/commands/skills/index.ts`:

```typescript
import { Command } from "commander";

export function registerSkillsCommand(program: Command): void {
  const skills = program.command("skills").description("Manage repo skills");

  skills.command("list").description("List discovered skills with mirror status").action(() => {
    // Implemented in Task 15
  });

  skills
    .command("create <name>")
    .description("Scaffold a new skill at .ai/skills/<name>/")
    .option("--description <text>", "Description for the new skill", "")
    .option(
      "--scope <id>",
      "Limit emission to this scope (repeatable); omit for root-only",
      (value: string, prev: string[]) => [...prev, value],
      [] as string[]
    )
    .option("--with-references", "Scaffold a references/ directory", false)
    .option("--with-scripts", "Scaffold a scripts/ directory", false)
    .action(() => {
      // Implemented in Task 16
    });
}
```

- [ ] **Step 2: Wire the registrar into `packages/cli/src/index.ts`**

Add to the imports at the top of `packages/cli/src/index.ts`:

```typescript
import { registerSkillsCommand } from "./commands/skills/index.js";
```

After the `program.version(...)` call, add:

```typescript
registerSkillsCommand(program);
```

- [ ] **Step 3: Run typecheck and smoke test**

Run: `pnpm --filter @timothycrooker/ai-context-cli typecheck`
Then: `pnpm --filter @timothycrooker/ai-context-cli build && node packages/cli/dist/index.js skills --help`
Expected: typecheck PASS; help text shows `list` and `create` subcommands.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/skills/index.ts packages/cli/src/index.ts
git commit -m "feat(cli): scaffold ai-context skills command group"
```

---

### Task 15: Implement `ai-context skills list`

**Files:**
- Create: `packages/cli/src/commands/skills/list.ts`
- Modify: `packages/cli/src/commands/skills/index.ts`
- Create: `packages/cli/test/skills-list.test.ts`

- [ ] **Step 1: Write failing test for `skills list`**

Create `packages/cli/test/skills-list.test.ts`:

```typescript
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliBin = path.resolve(__dirname, "../dist/index.js");

describe("ai-context skills list", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-cli-list-"));
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
        skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"] },
      })
    );
    fs.mkdirSync(path.join(tmp, ".ai/skills/demo"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/skills/demo/SKILL.md"),
      "---\nname: demo\ndescription: A demo skill\n---\nbody\n"
    );
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("lists skills with their descriptions", () => {
    execSync(`node ${cliBin} build`, { cwd: tmp });
    const output = execSync(`node ${cliBin} skills list`, { cwd: tmp }).toString();
    expect(output).toContain("demo");
    expect(output).toContain("A demo skill");
  });

  it("emits JSON with --json", () => {
    execSync(`node ${cliBin} build`, { cwd: tmp });
    const output = execSync(`node ${cliBin} skills list --json`, { cwd: tmp }).toString();
    const parsed = JSON.parse(output);
    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0].name).toBe("demo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @timothycrooker/ai-context-cli build && pnpm --filter @timothycrooker/ai-context-cli test`
Expected: FAIL — `skills list` doesn't print anything yet.

- [ ] **Step 3: Implement `skills list`**

Create `packages/cli/src/commands/skills/list.ts`:

```typescript
import process from "node:process";
import path from "node:path";
import {
  discoverSkills,
  formatContextError,
  planSkillMirrors,
  type Manifest,
} from "@timothycrooker/ai-context-core";
import fs from "node:fs";

interface ListOptions {
  json?: boolean;
}

function loadManifestForCli(cwd: string): Manifest {
  const manifestPath = path.join(cwd, ".ai/context/manifest.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
}

export function runSkillsList(opts: ListOptions): void {
  try {
    const cwd = process.cwd();
    const manifest = loadManifestForCli(cwd);
    if (!manifest.skills) {
      if (opts.json) {
        console.log(JSON.stringify({ skills: [] }, null, 2));
      } else {
        console.log("No skills configured (manifest.skills absent).");
      }
      return;
    }

    const skills = discoverSkills(cwd, manifest.skills.source);
    const plans = planSkillMirrors(cwd, manifest, skills);

    const skillRows = skills.map((s) => {
      const skillPlans = plans.filter((p) => p.source === s.dir);
      const mirrorStatus = skillPlans.map((p) => {
        const exists = fs.existsSync(p.mirror);
        if (!exists) return { path: path.relative(cwd, p.mirror), state: "missing" };
        try {
          const stat = fs.lstatSync(p.mirror);
          return {
            path: path.relative(cwd, p.mirror),
            state: stat.isSymbolicLink() ? "symlink" : "copy",
          };
        } catch {
          return { path: path.relative(cwd, p.mirror), state: "unknown" };
        }
      });
      return {
        name: s.name,
        description: s.frontmatter.description,
        scope: s.frontmatter.scope ?? [],
        source: path.relative(cwd, s.dir),
        mirrors: mirrorStatus,
      };
    });

    if (opts.json) {
      console.log(JSON.stringify({ skills: skillRows }, null, 2));
      return;
    }

    for (const skill of skillRows) {
      const scopeTag = skill.scope.length === 0 ? "[root]" : `[${skill.scope.join(",")}]`;
      console.log(`${skill.name} ${scopeTag}`);
      console.log(`  ${skill.description}`);
      console.log(`  source: ${skill.source}`);
      for (const m of skill.mirrors) {
        console.log(`  ${m.state}: ${m.path}`);
      }
      console.log("");
    }
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
```

- [ ] **Step 4: Wire `runSkillsList` into the command group**

In `packages/cli/src/commands/skills/index.ts`, update the `list` subcommand action:

```typescript
import { runSkillsList } from "./list.js";

// In registerSkillsCommand:
skills
  .command("list")
  .description("List discovered skills with mirror status")
  .option("--json", "Emit JSON output", false)
  .action((opts: { json: boolean }) => runSkillsList({ json: Boolean(opts.json) }));
```

- [ ] **Step 5: Build and run tests**

Run: `pnpm --filter @timothycrooker/ai-context-cli build && pnpm --filter @timothycrooker/ai-context-cli test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/skills/list.ts packages/cli/src/commands/skills/index.ts packages/cli/test/skills-list.test.ts
git commit -m "feat(cli): implement ai-context skills list"
```

---

### Task 16: Implement `ai-context skills create <name>`

**Files:**
- Create: `packages/cli/src/commands/skills/create.ts`
- Modify: `packages/cli/src/commands/skills/index.ts`
- Create: `packages/cli/test/skills-create.test.ts`

- [ ] **Step 1: Write failing test for `skills create`**

Create `packages/cli/test/skills-create.test.ts`:

```typescript
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliBin = path.resolve(__dirname, "../dist/index.js");

describe("ai-context skills create", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-cli-create-"));
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
        skills: { source: ".ai/skills", mirrors: [".agents/skills", ".claude/skills"] },
      })
    );
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("scaffolds a new skill at .ai/skills/<name>/SKILL.md", () => {
    execSync(`node ${cliBin} skills create my-skill --description "Does a thing"`, { cwd: tmp });
    const skillMd = fs.readFileSync(
      path.join(tmp, ".ai/skills/my-skill/SKILL.md"),
      "utf8"
    );
    expect(skillMd).toContain("name: my-skill");
    expect(skillMd).toContain("description: Does a thing");
  });

  it("creates symlinks at both mirror paths", () => {
    execSync(`node ${cliBin} skills create my-skill --description "x"`, { cwd: tmp });
    expect(
      fs.lstatSync(path.join(tmp, ".agents/skills/my-skill")).isSymbolicLink()
    ).toBe(true);
    expect(
      fs.lstatSync(path.join(tmp, ".claude/skills/my-skill")).isSymbolicLink()
    ).toBe(true);
  });

  it("scaffolds references/ and scripts/ when flags set", () => {
    execSync(
      `node ${cliBin} skills create rich --description "x" --with-references --with-scripts`,
      { cwd: tmp }
    );
    expect(fs.existsSync(path.join(tmp, ".ai/skills/rich/references"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".ai/skills/rich/scripts"))).toBe(true);
  });

  it("errors when name is invalid", () => {
    expect(() =>
      execSync(`node ${cliBin} skills create Bad_Name --description "x"`, { cwd: tmp, stdio: "pipe" })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @timothycrooker/ai-context-cli test`
Expected: FAIL — `skills create` does nothing yet.

- [ ] **Step 3: Implement `skills create`**

Create `packages/cli/src/commands/skills/create.ts`:

```typescript
import process from "node:process";
import path from "node:path";
import fs from "node:fs";
import { buildAll, formatContextError } from "@timothycrooker/ai-context-core";

interface CreateOptions {
  description: string;
  scope: string[];
  withReferences: boolean;
  withScripts: boolean;
}

const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function runSkillsCreate(name: string, opts: CreateOptions): void {
  try {
    if (!SKILL_NAME_PATTERN.test(name) || name.length > 64) {
      console.error(
        `error: invalid skill name '${name}'. Use lowercase letters, digits, and hyphens only (max 64 chars, no leading/trailing/consecutive hyphens).`
      );
      process.exit(1);
    }

    const cwd = process.cwd();
    const manifestPath = path.join(cwd, ".ai/context/manifest.json");
    if (!fs.existsSync(manifestPath)) {
      console.error("error: .ai/context/manifest.json not found. Run `ai-context init` first.");
      process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!manifest.skills) {
      console.error(
        "error: manifest.skills is not configured. Run `ai-context init --upgrade` to enable the skills subsystem."
      );
      process.exit(1);
    }

    const sourceDir = path.join(cwd, manifest.skills.source, name);
    if (fs.existsSync(sourceDir)) {
      console.error(`error: skill source already exists at ${path.relative(cwd, sourceDir)}`);
      process.exit(1);
    }

    fs.mkdirSync(sourceDir, { recursive: true });

    const scopeYaml =
      opts.scope.length === 0 ? "" : `scope: [${opts.scope.join(", ")}]\n`;
    const description = opts.description.length > 0 ? opts.description : `Describe ${name}`;

    const skillMd = `---
name: ${name}
description: ${description}
${scopeYaml}---

# ${name}

Replace this section with the skill's instructions. Keep it concise — under ~500 lines. Move long reference material into \`references/\` (loaded on demand).
`;

    fs.writeFileSync(path.join(sourceDir, "SKILL.md"), skillMd, "utf8");

    if (opts.withReferences) {
      fs.mkdirSync(path.join(sourceDir, "references"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, "references/example.md"),
        `# Reference: example\n\nLong-form supporting content for ${name}. Reference this file from SKILL.md.\n`,
        "utf8"
      );
    }
    if (opts.withScripts) {
      fs.mkdirSync(path.join(sourceDir, "scripts"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, "scripts/example.sh"),
        `#!/usr/bin/env bash\nset -euo pipefail\n\necho "Skill ${name}: example script"\n`,
        "utf8"
      );
      fs.chmodSync(path.join(sourceDir, "scripts/example.sh"), 0o755);
    }

    console.log(`Created: ${path.relative(cwd, sourceDir)}`);

    // Run build to create mirrors
    const result = buildAll(cwd);
    for (const file of result.written) {
      console.log(`Created mirror: ${file}`);
    }
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
```

- [ ] **Step 4: Wire `runSkillsCreate` into the command group**

In `packages/cli/src/commands/skills/index.ts`:

```typescript
import { runSkillsCreate } from "./create.js";

// In the `create` subcommand action:
.action((name: string, opts: { description: string; scope: string[]; withReferences: boolean; withScripts: boolean }) =>
  runSkillsCreate(name, {
    description: opts.description,
    scope: opts.scope,
    withReferences: Boolean(opts.withReferences),
    withScripts: Boolean(opts.withScripts),
  })
)
```

- [ ] **Step 5: Build and run tests**

Run: `pnpm --filter @timothycrooker/ai-context-cli build && pnpm --filter @timothycrooker/ai-context-cli test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/skills/create.ts packages/cli/src/commands/skills/index.ts packages/cli/test/skills-create.test.ts
git commit -m "feat(cli): implement ai-context skills create"
```

---

### Task 17: Implement `ai-context init --upgrade` and `--refresh-meta-skill`

**Files:**
- Modify: `packages/core/src/engine.ts` (extend `initProject` signature)
- Modify: `packages/core/src/types.ts` (extend `InitOptions`)
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/templates/src/standard.ts`, `monorepo.ts` (skill seed files added in Task 22)
- Create: `packages/cli/test/init-upgrade.test.ts`

- [ ] **Step 1: Extend `InitOptions` type**

In `packages/core/src/types.ts`, edit `InitOptions`:

```typescript
export interface InitOptions {
  force?: boolean;
  includeExampleScopes?: boolean;
  upgrade?: boolean;
  refreshMetaSkill?: boolean;
}
```

- [ ] **Step 2: Extend `initProject` in `engine.ts`**

Locate `initProject` in `packages/core/src/engine.ts`. The current behavior writes template files when their paths don't yet exist (or always when `force: true`). Extend:

```typescript
export function initProject(
  cwd: string,
  template: Template,
  options: InitOptions = {}
): string[] {
  const written: string[] = [];

  for (const file of template.files) {
    const abs = path.join(cwd, file.path);
    const exists = fs.existsSync(abs);
    const isSkillFile = file.path.startsWith(".ai/skills/");

    if (exists && !options.force) {
      // Upgrade mode: write only files that don't exist
      if (options.upgrade) {
        // For meta-skill, allow refresh when flag set
        if (isSkillFile && options.refreshMetaSkill) {
          writeUtf8(abs, file.content);
          written.push(file.path);
        }
        continue;
      }
      throw new ContextError(
        "AICTX_INIT_FAILED",
        `Refusing to overwrite ${file.path}; use --force or --upgrade`
      );
    }

    writeUtf8(abs, file.content);
    written.push(file.path);
  }

  // If upgrade mode added the skills manifest block, run build to materialize mirrors
  if (options.upgrade) {
    try {
      const buildResult = buildAll(cwd);
      for (const f of buildResult.written) {
        if (!written.includes(f)) written.push(f);
      }
    } catch {
      // Build failure is non-fatal in upgrade mode — leave the user with a working but un-built repo
    }
  }

  return written.sort();
}
```

The exact integration depends on `initProject`'s current shape; adjust the logic to match while preserving the contract: `upgrade=true` is non-destructive except for `--refresh-meta-skill`.

- [ ] **Step 3: Update CLI `init` to expose flags**

In `packages/cli/src/index.ts`, extend the `init` command:

```typescript
program
  .command("init")
  .description("Initialize context scaffolding")
  .option("--template <name>", "template name (auto-detected if omitted)", "auto")
  .option("--force", "overwrite existing files", false)
  .option("--upgrade", "add missing files only; do not overwrite existing", false)
  .option("--refresh-meta-skill", "refresh the ai-context-kit meta-skill", false)
  .action((opts: { template: string; force: boolean; upgrade: boolean; refreshMetaSkill: boolean }) => {
    try {
      const templateName = opts.template === "auto" ? detectTemplate(process.cwd()) : opts.template;
      const template = getTemplate(templateName);
      const written = initProject(process.cwd(), template, {
        force: Boolean(opts.force),
        upgrade: Boolean(opts.upgrade),
        refreshMetaSkill: Boolean(opts.refreshMetaSkill),
      });
      for (const file of written) {
        console.log(`created: ${file}`);
      }
      console.log(`Initialized template '${template.name}'`);
    } catch (error) {
      console.error(formatContextError(error));
      process.exit(1);
    }
  });
```

- [ ] **Step 4: Write test for init --upgrade**

Create `packages/cli/test/init-upgrade.test.ts`:

```typescript
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliBin = path.resolve(__dirname, "../dist/index.js");

describe("ai-context init --upgrade", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-init-upgrade-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("does not overwrite existing files", () => {
    fs.mkdirSync(path.join(tmp, ".ai/context"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({ version: 1, modulesDir: ".ai/context/modules", scopesFile: ".ai/context/scopes.json", targets: { root: "AGENTS.md" } })
    );
    execSync(`node ${cliBin} init --upgrade --template standard`, { cwd: tmp });
    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, ".ai/context/manifest.json"), "utf8"));
    // Manifest is preserved (no overwrite)
    expect(manifest.targets.root).toBe("AGENTS.md");
  });

  it("seeds .ai/skills/ai-context-kit/ on a previously skill-less repo", () => {
    fs.mkdirSync(path.join(tmp, ".ai/context"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({ version: 1, modulesDir: ".ai/context/modules", scopesFile: ".ai/context/scopes.json", targets: { root: "AGENTS.md" } })
    );
    execSync(`node ${cliBin} init --upgrade --template standard`, { cwd: tmp });
    expect(fs.existsSync(path.join(tmp, ".ai/skills/ai-context-kit/SKILL.md"))).toBe(true);
  });
});
```

(These tests will run after Task 22 adds the meta-skill files to templates. Mark this task as DONE when Task 22 ships and the test passes.)

- [ ] **Step 5: Build and confirm CLI builds**

Run: `pnpm --filter @timothycrooker/ai-context-cli build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/engine.ts packages/core/src/types.ts packages/cli/src/index.ts packages/cli/test/init-upgrade.test.ts
git commit -m "feat(cli,core): init --upgrade and --refresh-meta-skill flags"
```

(Note: the `init-upgrade.test.ts` test will not yet pass until Task 22 ships the meta-skill template files. That's expected — Task 22 closes the loop.)

---

## Phase G — Templates / meta-skill content

### Task 18: Meta-skill SKILL.md body

**Files:**
- Create: `packages/templates/src/skills/ai-context-kit/SKILL.md`

- [ ] **Step 1: Write meta-skill body**

Create `packages/templates/src/skills/ai-context-kit/SKILL.md`:

```markdown
---
name: ai-context-kit
description: Use when authoring context modules, scopes, or skills in this repo; when adding new agent context; when running `ai-context build/verify/doctor`; or when an agent needs to understand how this repo's AGENTS.md / CLAUDE.md / .claude/rules / .agents/skills / .claude/skills are generated. Triggers on phrases like "add a module", "new scope", "create a skill", "ai-context build", "AGENTS.md is generated", or any question about the .ai/ directory layout.
---

# ai-context-kit

This repo's `AGENTS.md`, `CLAUDE.md`, `.claude/rules/*.md`, `.agents/skills/*`, and `.claude/skills/*` are all generated by [ai-context-kit](https://github.com/TimCrooker/ai-context-kit) from sources under `.ai/`.

**One rule: edit `.ai/`, never edit the generated outputs.**

## Quickstart

| You want to... | See |
|---|---|
| Add a new context module (lands in AGENTS.md/CLAUDE.md) | `references/authoring-modules.md` |
| Add a new scope (per-package context targeting) | `references/authoring-scopes.md` |
| Add a new skill (cross-CLI agent capability) | `references/authoring-skills.md` |
| Understand `.ai/context/manifest.json` | `references/manifest-schema.md` |
| Look up an `ai-context` CLI command | `references/cli-commands.md` |
| Pick what kind of content to put in a module vs a skill vs a rule | `references/content-guide.md` |

## After any edit

```bash
ai-context build       # regenerate outputs
ai-context verify      # CI-friendly: fails if outputs are stale
ai-context doctor      # diagnose config / mirror issues
```

## Directory map

| Path | What lives here | Who edits |
|---|---|---|
| `.ai/context/modules/*.md` | Module content (composed into AGENTS.md/CLAUDE.md per target) | You |
| `.ai/context/scopes.json` | Scope definitions: which modules go to which targets | You |
| `.ai/context/manifest.json` | Top-level kit configuration | You |
| `.ai/skills/<name>/` | Skill source (SKILL.md + optional references/, scripts/, assets/) | You |
| `.agents/skills/<name>` | Symlink to `.ai/skills/<name>/` — discovered by Codex, Gemini, Cursor, Goose, etc. | Kit (symlink) |
| `.claude/skills/<name>` | Symlink to `.ai/skills/<name>/` — discovered by Claude Code | Kit (symlink) |
| `.claude/rules/*.md` | Path-glob rule files for Claude | Kit (generated) |
| `AGENTS.md`, `CLAUDE.md` (root + scoped) | Aggregated context for agents | Kit (generated) |

## Don't

- Don't edit generated `AGENTS.md` / `CLAUDE.md` / `.claude/rules/*.md` — edits get overwritten on next `ai-context build`.
- Don't commit broken symlinks in `.agents/skills/` or `.claude/skills/`. Run `ai-context doctor` to detect them.
- Don't duplicate content between a module and a skill. Modules are always-in-context summary; skills are on-demand depth.
```

- [ ] **Step 2: Commit**

```bash
git add packages/templates/src/skills/ai-context-kit/SKILL.md
git commit -m "feat(templates): ai-context-kit meta-skill body"
```

---

### Task 19: Meta-skill reference docs (5 files)

**Files:**
- Create: `packages/templates/src/skills/ai-context-kit/references/authoring-modules.md`
- Create: `packages/templates/src/skills/ai-context-kit/references/authoring-scopes.md`
- Create: `packages/templates/src/skills/ai-context-kit/references/authoring-skills.md`
- Create: `packages/templates/src/skills/ai-context-kit/references/manifest-schema.md`
- Create: `packages/templates/src/skills/ai-context-kit/references/cli-commands.md`
- Create: `packages/templates/src/skills/ai-context-kit/references/content-guide.md`

- [ ] **Step 1: Write `authoring-modules.md`**

Cover: module file naming convention (`010-name.md`), frontmatter (`id`, `targets`, `order`), where files go (`.ai/context/modules/`), what targets are valid (defined in `manifest.json` — root + scope IDs), how to author the body (markdown, concise, no fluff), how modules aggregate into AGENTS.md/CLAUDE.md.

Include a working example with frontmatter + body.

- [ ] **Step 2: Write `authoring-scopes.md`**

Cover: what a scope is (a per-package/per-target context configuration), `.ai/context/scopes.json` schema, `id` + `codexTarget` + `includes` vs `codexIncludes` vs `claudeIncludes`, `claudeRuleFile` + `claudePaths` for path-glob rules, how to add a new scope step-by-step.

- [ ] **Step 3: Write `authoring-skills.md`**

Cover: where skills live (`.ai/skills/<name>/`), the directory-tree shape (SKILL.md required + optional references/scripts/assets), agentskills.io frontmatter (`name` matching dir, `description` ≤1024 chars, optional `scope: [...]`), `ai-context skills create` command, how mirrors propagate, monorepo scoping with `scope: [api]`. Reference the spec for advanced details.

- [ ] **Step 4: Write `manifest-schema.md`**

Field-by-field reference for `.ai/context/manifest.json`: `version`, `modulesDir`, `scopesFile`, `targets`, `claudeOutput`, `skills.source`, `skills.mirrors`, `skills.metaSkill`. Include a complete working example.

- [ ] **Step 5: Write `cli-commands.md`**

Reference every `ai-context` subcommand with example invocations: `init`, `init --upgrade`, `init --refresh-meta-skill`, `templates`, `build`, `build --check`, `build --remove-orphans`, `verify`, `diff`, `doctor`, `lint-config`, `skills create`, `skills list`, `skills list --json`.

- [ ] **Step 6: Write `content-guide.md`**

A trimmed version of `docs/content-guide.md` focused on: rule file anatomy, when to use module vs skill vs rule, common writing mistakes. (Or include the existing `docs/content-guide.md` by reference if the template bundling can support that — simpler to inline a focused subset.)

- [ ] **Step 7: Commit**

```bash
git add packages/templates/src/skills/ai-context-kit/references/
git commit -m "feat(templates): ai-context-kit meta-skill reference docs"
```

---

### Task 20: Meta-skill helper script

**Files:**
- Create: `packages/templates/src/skills/ai-context-kit/scripts/doctor.sh`

- [ ] **Step 1: Write `doctor.sh`**

```bash
#!/usr/bin/env bash
# Convenience wrapper invoking `ai-context doctor` with kit-friendly defaults.
# Bundled with the ai-context-kit meta-skill so agents have a single command they can rely on.
set -euo pipefail

if ! command -v ai-context >/dev/null 2>&1; then
  echo "ai-context CLI not on PATH. Install with: pnpm add -D @timothycrooker/ai-context-cli" >&2
  exit 1
fi

ai-context doctor
```

Mark executable: `chmod +x packages/templates/src/skills/ai-context-kit/scripts/doctor.sh`

- [ ] **Step 2: Commit**

```bash
git add packages/templates/src/skills/ai-context-kit/scripts/doctor.sh
git commit -m "feat(templates): ai-context-kit doctor helper script"
```

---

### Task 21: Wire meta-skill files into `standard` and `monorepo` templates

**Files:**
- Modify: `packages/templates/src/standard.ts`
- Modify: `packages/templates/src/monorepo.ts`
- Modify: `packages/templates/src/index.ts` (template loader)
- Create: `packages/templates/test/skills-template.test.ts`

- [ ] **Step 1: Inventory the existing template file-bundling pattern**

Read `packages/templates/src/standard.ts` to see how template files are declared (`Template.files` = `{path, content}[]`). The meta-skill is multi-file — we need a helper that reads the actual files from `packages/templates/src/skills/ai-context-kit/` at build time and bundles them into the template payload.

- [ ] **Step 2: Add a meta-skill bundler helper**

Create `packages/templates/src/skills-bundler.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TemplateFile } from "@timothycrooker/ai-context-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function bundleMetaSkill(): TemplateFile[] {
  const root = path.resolve(__dirname, "skills/ai-context-kit");
  const files: TemplateFile[] = [];

  function walk(dir: string, relRoot: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.join(relRoot, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(abs, "utf8");
        files.push({ path: `.ai/skills/ai-context-kit/${rel.split(path.sep).join("/")}`, content });
      }
    }
  }

  walk(root, "");
  return files;
}
```

Note: this reads files at runtime from the templates package's `dist/skills/` directory after tsup build. We need tsup to bundle the skill files into `dist/`. Update `packages/templates/tsup.config.ts` (or equivalent) to copy `src/skills/` into `dist/skills/`. If tsup doesn't natively copy, add a build step:

```json
// packages/templates/package.json, scripts:
"build": "tsup && cp -R src/skills dist/skills"
```

(Use `cpy-cli` or `shx` for cross-platform if needed; current repo is macOS-dominant so `cp -R` is fine for v1.)

- [ ] **Step 3: Use the bundler in `standard.ts` and `monorepo.ts`**

In `packages/templates/src/standard.ts`, near the existing manifest/scopes/module file declarations, extend the template:

```typescript
import { bundleMetaSkill } from "./skills-bundler.js";

// In STANDARD_TEMPLATE.files = [ ... ]:
// Update the existing manifest.json content to include the skills block:
const MANIFEST_JSON = JSON.stringify(
  {
    $schema: "./schemas/manifest.schema.json",
    version: 1,
    modulesDir: ".ai/context/modules",
    scopesFile: ".ai/context/scopes.json",
    targets: { root: "AGENTS.md" },
    skills: {
      source: ".ai/skills",
      mirrors: [".agents/skills", ".claude/skills"],
      metaSkill: true,
    },
  },
  null,
  2,
);

// At the end of the file list, append the meta-skill files:
export const STANDARD_TEMPLATE: Template = {
  name: "standard",
  files: [
    // ... existing files ...
    ...bundleMetaSkill(),
  ],
};
```

Apply the same change to `packages/templates/src/monorepo.ts`.

- [ ] **Step 4: Write a snapshot-style test confirming meta-skill files are bundled**

Create `packages/templates/test/skills-template.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getTemplate } from "../src/index.js";

describe("templates bundle meta-skill", () => {
  for (const name of ["standard", "monorepo"]) {
    it(`${name} template includes .ai/skills/ai-context-kit/SKILL.md`, () => {
      const template = getTemplate(name);
      const skillMd = template.files.find(
        (f) => f.path === ".ai/skills/ai-context-kit/SKILL.md"
      );
      expect(skillMd).toBeDefined();
      expect(skillMd!.content).toContain("name: ai-context-kit");
    });

    it(`${name} template includes reference docs`, () => {
      const template = getTemplate(name);
      const refs = template.files.filter((f) =>
        f.path.startsWith(".ai/skills/ai-context-kit/references/")
      );
      expect(refs.length).toBeGreaterThanOrEqual(5);
    });

    it(`${name} manifest enables skills`, () => {
      const template = getTemplate(name);
      const manifest = template.files.find((f) => f.path === ".ai/context/manifest.json");
      expect(manifest!.content).toContain('"skills"');
    });
  }
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @timothycrooker/ai-context-templates build && pnpm --filter @timothycrooker/ai-context-templates test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/templates/src/standard.ts packages/templates/src/monorepo.ts packages/templates/src/skills-bundler.ts packages/templates/package.json packages/templates/test/skills-template.test.ts
git commit -m "feat(templates): bundle meta-skill into standard + monorepo templates"
```

---

## Phase H — Docs

### Task 22: Write public-facing `docs/skills-guide.md`

**Files:**
- Create: `docs/skills-guide.md`

- [ ] **Step 1: Write the consumer-facing skills guide**

Create `docs/skills-guide.md`:

```markdown
# Skills Guide

How `ai-context-kit` manages cross-CLI skills (Claude Code, Codex, Gemini, Cursor, Goose, OpenCode, Aider, and 17+ other tools on the agents.md compatibility list).

## TL;DR

Author skills once at `.ai/skills/<name>/SKILL.md`. Run `ai-context build`. Every agent CLI sees them.

## What is a skill?

A skill is a directory containing a `SKILL.md` file (per the [agentskills.io](https://agentskills.io) open standard) plus optional `references/`, `scripts/`, and `assets/` subdirectories. SKILL.md has YAML frontmatter declaring `name` + `description`. Agents auto-load the skill when its description matches the current task.

## How it works

`.ai/skills/<name>/` is the source. `ai-context build` creates **symlinks** at every path listed in `manifest.skills.mirrors` (default `.agents/skills/<name>` and `.claude/skills/<name>`). All three locations resolve to the same file on disk — edit any of them, and the source is updated.

## Authoring a new skill

```bash
ai-context skills create my-skill --description "What this skill does"
```

This scaffolds `.ai/skills/my-skill/SKILL.md`, creates the mirror symlinks, and you can immediately start editing the SKILL.md body.

## Adding references and scripts

```bash
ai-context skills create my-skill --description "..." --with-references --with-scripts
```

This scaffolds `references/example.md` and `scripts/example.sh` alongside `SKILL.md`. Reference them from the SKILL.md body — agents load them on demand.

## Monorepo: per-package skills

Add `scope:` to the skill's frontmatter:

```yaml
---
name: api-conventions
description: HTTP API conventions for the api package
scope: [api]
---
```

The skill emits to `apps/api/.agents/skills/api-conventions` and `apps/api/.claude/skills/api-conventions` instead of repo root. Use `scope: ["*"]` to emit at root AND every scope.

## Windows users

Symlinks need Developer Mode enabled (Settings → Update & Security → For developers) and `git config core.symlinks true`. Without them, the kit falls back to copying skill content with a `_generated:` banner. `ai-context doctor` reports the fallback.

## Don't

- Don't put two skills in nested subdirectories: `.ai/skills/foo/bar/SKILL.md` is not discovered as a skill named `bar`. Skills are flat.
- Don't author a skill named the same as the kit's meta-skill (`ai-context-kit`) — that name is reserved.
- Don't edit `.claude/skills/` or `.agents/skills/` content as if they were copies — they're symlinks, edits propagate to source. (This is a feature on macOS/Linux; a confusion on Windows where they may be copies.)

## See also

- `docs/content-guide.md` — when to use a skill vs a module vs a rule
- The meta-skill at `.ai/skills/ai-context-kit/` — installed in every kit-using repo, explains everything in detail to agents in your repo
- [agentskills.io specification](https://agentskills.io/specification)
- [Claude Code skills docs](https://code.claude.com/docs/en/skills)
```

- [ ] **Step 2: Commit**

```bash
git add docs/skills-guide.md
git commit -m "docs: add consumer-facing skills guide"
```

---

### Task 23: Update reference docs (cli-contract, configuration, error-codes, support-policy, README)

**Files:**
- Modify: `docs/cli-contract.md`
- Modify: `docs/configuration.md`
- Modify: `docs/error-codes.md`
- Modify: `docs/support-policy.md`
- Modify: `README.md`

- [ ] **Step 1: Extend `docs/cli-contract.md`**

Add subsections for:
- `ai-context skills list` — exit codes, output format, `--json` mode
- `ai-context skills create <name>` — exit codes, required flags, behavior
- `ai-context init --upgrade` — semantics, non-destructive guarantee
- `ai-context init --refresh-meta-skill` — semantics, what gets overwritten

- [ ] **Step 2: Extend `docs/configuration.md`**

Add a "Skills" section documenting the manifest `skills` block: `source`, `mirrors`, `metaSkill`. Include a complete example manifest.

- [ ] **Step 3: Extend `docs/error-codes.md`**

Document new error codes:
- `AICTX_SKILL_FRONTMATTER_INVALID`
- `AICTX_SKILL_NAME_INVALID`
- `AICTX_SKILL_MISSING_FILE`
- `AICTX_SKILL_SCOPE_UNKNOWN`
- `AICTX_SKILL_MIRROR_CONFLICT`
- `AICTX_SKILL_MIRROR_BROKEN`

Each entry: code, what it means, how to fix.

- [ ] **Step 4: Extend `docs/support-policy.md`**

Extend the versioning policy through 1.x. State: "Starting at v1.0, manifest schema additions are non-breaking (the `skills` field was added as opt-in). Removing or renaming an existing field is a major bump."

- [ ] **Step 5: Update `README.md`**

Add a section in the existing "Compatibility Model" or near it:

```markdown
## Skills (1.0+)

ai-context-kit supports cross-CLI skills via the [agentskills.io](https://agentskills.io) open standard. Author once at `.ai/skills/<name>/SKILL.md`; the kit creates symlinks at `.agents/skills/<name>` (read by Codex, Gemini, Cursor, Goose, OpenCode, Aider, +18 other tools) and `.claude/skills/<name>` (read by Claude Code). See [docs/skills-guide.md](docs/skills-guide.md).
```

- [ ] **Step 6: Commit**

```bash
git add docs/cli-contract.md docs/configuration.md docs/error-codes.md docs/support-policy.md README.md
git commit -m "docs: update reference docs and README for skills subsystem"
```

---

## Phase I — Gauntlet

### Task 24: Build `examples/gauntlet/` fixture project

**Files:**
- Create: `examples/gauntlet/.ai/context/manifest.json`
- Create: `examples/gauntlet/.ai/context/scopes.json`
- Create: `examples/gauntlet/.ai/context/modules/010-overview.md`
- Create: `examples/gauntlet/.ai/skills/plain-skill/SKILL.md`
- Create: `examples/gauntlet/.ai/skills/skill-with-refs/SKILL.md`
- Create: `examples/gauntlet/.ai/skills/skill-with-refs/references/notes.md`
- Create: `examples/gauntlet/.ai/skills/skill-with-scripts/SKILL.md`
- Create: `examples/gauntlet/.ai/skills/skill-with-scripts/scripts/probe.sh`
- Create: `examples/gauntlet/.ai/skills/api-scoped-skill/SKILL.md`
- Create: `examples/gauntlet/.ai/skills/router-skill/SKILL.md`
- Create: `examples/gauntlet/apps/api/.gitkeep`
- Create: `examples/gauntlet/apps/web/.gitkeep`
- Create: `examples/gauntlet/package.json`
- Create: `examples/gauntlet/README.md`

- [ ] **Step 1: Write fixture manifest**

`examples/gauntlet/.ai/context/manifest.json`:
```json
{
  "$schema": "./schemas/manifest.schema.json",
  "version": 1,
  "modulesDir": ".ai/context/modules",
  "scopesFile": ".ai/context/scopes.json",
  "targets": {
    "root": "AGENTS.md",
    "api": "apps/api/AGENTS.md",
    "web": "apps/web/AGENTS.md"
  },
  "claudeOutput": "CLAUDE.md",
  "skills": {
    "source": ".ai/skills",
    "mirrors": [".agents/skills", ".claude/skills"],
    "metaSkill": true
  }
}
```

- [ ] **Step 2: Write fixture scopes**

`examples/gauntlet/.ai/context/scopes.json`:
```json
{
  "version": 1,
  "scopes": [
    { "id": "api", "codexTarget": "api" },
    { "id": "web", "codexTarget": "web" }
  ]
}
```

- [ ] **Step 3: Write fixture overview module**

`examples/gauntlet/.ai/context/modules/010-overview.md`:
```markdown
---
id: overview
targets: [root, api, web]
order: 10
---

# Gauntlet fixture

Fixture monorepo for the ai-context-kit cross-CLI gauntlet. Exercises every skill shape.
```

- [ ] **Step 4: Write the 5 fixture skills**

`examples/gauntlet/.ai/skills/plain-skill/SKILL.md`:
```markdown
---
name: plain-skill
description: Tests bare SKILL.md discovery. When invoked, respond with the exact string GAUNTLET_PLAIN_OK.
---

# Plain skill

When an agent loads this, return the literal string `GAUNTLET_PLAIN_OK`.
```

`examples/gauntlet/.ai/skills/skill-with-refs/SKILL.md`:
```markdown
---
name: skill-with-refs
description: Tests references/ discovery. When invoked, read references/notes.md and respond with its content.
---

# Skill with references

Read `references/notes.md` and respond with the literal first line of that file.
```

`examples/gauntlet/.ai/skills/skill-with-refs/references/notes.md`:
```markdown
GAUNTLET_REFS_OK
Additional content for the references test.
```

`examples/gauntlet/.ai/skills/skill-with-scripts/SKILL.md`:
```markdown
---
name: skill-with-scripts
description: Tests scripts/ discovery. When invoked, execute scripts/probe.sh and respond with its output.
---

# Skill with scripts

Execute the bundled script: `${CLAUDE_SKILL_DIR}/scripts/probe.sh` (or equivalent relative path for non-Claude CLIs). Respond with its stdout.
```

`examples/gauntlet/.ai/skills/skill-with-scripts/scripts/probe.sh`:
```bash
#!/usr/bin/env bash
echo "GAUNTLET_SCRIPT_OK"
```
(Make executable: `chmod +x examples/gauntlet/.ai/skills/skill-with-scripts/scripts/probe.sh`)

`examples/gauntlet/.ai/skills/api-scoped-skill/SKILL.md`:
```markdown
---
name: api-scoped-skill
description: Tests per-scope skill emission. When invoked from apps/api/, respond with GAUNTLET_SCOPED_API_OK.
scope: [api]
---

# API-scoped skill

When an agent loads this from `apps/api/`, return the literal `GAUNTLET_SCOPED_API_OK`. This skill should not be discoverable from repo root or from `apps/web/`.
```

`examples/gauntlet/.ai/skills/router-skill/SKILL.md`:
```markdown
---
name: router-skill
description: Tests skill family routing. When invoked, list the names of the other gauntlet skills.
---

# Router skill

Sibling skills: `plain-skill`, `skill-with-refs`, `skill-with-scripts`, `api-scoped-skill`.

When invoked, respond with: `GAUNTLET_ROUTER_OK: plain-skill, skill-with-refs, skill-with-scripts, api-scoped-skill`.
```

- [ ] **Step 5: Add `.gitkeep` for `apps/api/` and `apps/web/`**

So git tracks the empty dirs the scoped skill mirrors will be created under.

- [ ] **Step 6: Write fixture README**

`examples/gauntlet/README.md`:
```markdown
# Gauntlet fixture

Synthetic kit-using monorepo exercising every skill shape. Driven by `scripts/gauntlet/run.sh`.

Each skill returns a unique magic string (`GAUNTLET_*_OK`) when correctly discovered + invoked by an agent CLI. The gauntlet asserts those strings appear in CLI output for each of Claude, Codex, and Gemini.
```

- [ ] **Step 7: Run `ai-context build` in the fixture to verify it generates cleanly**

```bash
cd ~/ai-context-kit
pnpm build
node packages/cli/dist/index.js build --check
# Then in the fixture:
cd examples/gauntlet
node ../../packages/cli/dist/index.js build
ls -la .agents/skills .claude/skills apps/api/.agents/skills apps/api/.claude/skills
```

Expected: All five mirror trees populated with symlinks; api-scoped-skill present at `apps/api/...` but not at root.

- [ ] **Step 8: Commit fixture**

```bash
cd ~/ai-context-kit
git add examples/gauntlet/
git commit -m "feat(examples): gauntlet fixture exercising every skill shape"
```

---

### Task 25: Build gauntlet runner

**Files:**
- Create: `scripts/gauntlet/run.sh`
- Create: `scripts/gauntlet/README.md`
- Modify: `package.json` (add `pnpm gauntlet` script)

- [ ] **Step 1: Write `scripts/gauntlet/README.md`**

Document: required CLIs (Claude Code, Codex, Gemini), required auth env vars, how to run, where results go, what each stage tests, known auth caveats.

- [ ] **Step 2: Write `scripts/gauntlet/run.sh`**

```bash
#!/usr/bin/env bash
# Gauntlet: validate cross-CLI skill discovery end-to-end.
# Usage: pnpm gauntlet [--skip-claude] [--skip-codex] [--skip-gemini]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE="$REPO_ROOT/examples/gauntlet"
RESULTS_DIR="$FIXTURE/results"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$RESULTS_DIR/$TIMESTAMP.md"

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
echo "# Gauntlet run $TIMESTAMP" > "$REPORT"
echo "" >> "$REPORT"

log_stage() {
  local stage="$1"; shift
  local outcome="$1"; shift
  local detail="$1"; shift
  echo "- **$stage**: $outcome" >> "$REPORT"
  if [ -n "$detail" ]; then
    echo "  - $detail" >> "$REPORT"
  fi
}

# Stage 1: Emission
echo "Stage 1: emission test (ai-context build)"
cd "$REPO_ROOT"
pnpm build >/dev/null
node packages/cli/dist/index.js --version >/dev/null
cd "$FIXTURE"
node "$REPO_ROOT/packages/cli/dist/index.js" build >/tmp/gauntlet-build.log 2>&1
ASSERT_PATHS=(
  ".agents/skills/plain-skill/SKILL.md"
  ".agents/skills/skill-with-refs/references/notes.md"
  ".agents/skills/skill-with-scripts/scripts/probe.sh"
  ".claude/skills/plain-skill/SKILL.md"
  ".claude/skills/router-skill/SKILL.md"
  "apps/api/.agents/skills/api-scoped-skill/SKILL.md"
  "apps/api/.claude/skills/api-scoped-skill/SKILL.md"
)
ALL_OK=1
for p in "${ASSERT_PATHS[@]}"; do
  if [ ! -e "$p" ]; then
    log_stage "Stage 1 emission" "FAIL" "missing $p"
    ALL_OK=0
  fi
done
[ "$ALL_OK" = "1" ] && log_stage "Stage 1 emission" "PASS" "all 7 paths present"

# Stage 2: Edit propagation
echo "Stage 2: edit propagation"
echo "EDIT_VIA_CLAUDE" >> "$FIXTURE/.claude/skills/plain-skill/SKILL.md"
if grep -q "EDIT_VIA_CLAUDE" "$FIXTURE/.ai/skills/plain-skill/SKILL.md"; then
  log_stage "Stage 2 edit propagation" "PASS" "edits to .claude/ landed in .ai/ source"
  git -C "$FIXTURE" checkout -- ".ai/skills/plain-skill/SKILL.md" 2>/dev/null || true
else
  log_stage "Stage 2 edit propagation" "FAIL" "edit did not propagate (symlinks broken?)"
fi

# Stage 3: Windows-fallback simulation
echo "Stage 3: force-copy fallback"
rm -rf "$FIXTURE/.agents/skills" "$FIXTURE/.claude/skills" "$FIXTURE/apps/api/.agents/skills" "$FIXTURE/apps/api/.claude/skills"
AI_CONTEXT_FORCE_COPY_FALLBACK=1 node "$REPO_ROOT/packages/cli/dist/index.js" build >/tmp/gauntlet-fallback.log 2>&1
if grep -q "<!-- _generated:" "$FIXTURE/.claude/skills/plain-skill/SKILL.md"; then
  log_stage "Stage 3 copy fallback" "PASS" "_generated banner present in copied SKILL.md"
else
  log_stage "Stage 3 copy fallback" "FAIL" "banner missing"
fi
# Reset to symlinks
rm -rf "$FIXTURE/.agents/skills" "$FIXTURE/.claude/skills" "$FIXTURE/apps/api/.agents/skills" "$FIXTURE/apps/api/.claude/skills"
node "$REPO_ROOT/packages/cli/dist/index.js" build >/dev/null 2>&1

# Stage 4: Claude headless discovery
if [ "$SKIP_CLAUDE" = "0" ] && command -v claude >/dev/null 2>&1; then
  echo "Stage 4: Claude headless"
  OUT="$(claude -p "List the names of every skill available in this repository. Output only the names, one per line." 2>&1 || true)"
  echo "$OUT" > "$RESULTS_DIR/$TIMESTAMP-claude.txt"
  EXPECTED=("plain-skill" "skill-with-refs" "skill-with-scripts" "router-skill" "ai-context-kit")
  MISSING=()
  for name in "${EXPECTED[@]}"; do
    grep -q "$name" "$RESULTS_DIR/$TIMESTAMP-claude.txt" || MISSING+=("$name")
  done
  if [ "${#MISSING[@]}" = "0" ]; then
    log_stage "Stage 4 Claude discovery" "PASS" "all skills listed"
  else
    log_stage "Stage 4 Claude discovery" "FAIL" "missing: ${MISSING[*]}"
  fi
else
  log_stage "Stage 4 Claude discovery" "SKIP" "claude not on PATH or --skip-claude"
fi

# Stage 5: Codex headless
if [ "$SKIP_CODEX" = "0" ] && command -v codex >/dev/null 2>&1; then
  echo "Stage 5: Codex headless"
  OUT="$(codex exec "List the names of every skill available in this repository." 2>&1 || true)"
  echo "$OUT" > "$RESULTS_DIR/$TIMESTAMP-codex.txt"
  # Same assertion logic as Claude
  EXPECTED=("plain-skill" "skill-with-refs" "skill-with-scripts" "router-skill" "ai-context-kit")
  MISSING=()
  for name in "${EXPECTED[@]}"; do
    grep -q "$name" "$RESULTS_DIR/$TIMESTAMP-codex.txt" || MISSING+=("$name")
  done
  if [ "${#MISSING[@]}" = "0" ]; then
    log_stage "Stage 5 Codex discovery" "PASS" "all skills listed"
  else
    log_stage "Stage 5 Codex discovery" "FAIL" "missing: ${MISSING[*]}"
  fi
else
  log_stage "Stage 5 Codex discovery" "SKIP" "codex not on PATH or --skip-codex"
fi

# Stage 6: Gemini headless
if [ "$SKIP_GEMINI" = "0" ] && command -v gemini >/dev/null 2>&1; then
  echo "Stage 6: Gemini headless"
  OUT="$(gemini -p "List the names of every skill available in this repository." 2>&1 || true)"
  echo "$OUT" > "$RESULTS_DIR/$TIMESTAMP-gemini.txt"
  EXPECTED=("plain-skill" "skill-with-refs" "skill-with-scripts" "router-skill" "ai-context-kit")
  MISSING=()
  for name in "${EXPECTED[@]}"; do
    grep -q "$name" "$RESULTS_DIR/$TIMESTAMP-gemini.txt" || MISSING+=("$name")
  done
  if [ "${#MISSING[@]}" = "0" ]; then
    log_stage "Stage 6 Gemini discovery" "PASS" "all skills listed"
  else
    log_stage "Stage 6 Gemini discovery" "FAIL" "missing: ${MISSING[*]}"
  fi
else
  log_stage "Stage 6 Gemini discovery" "SKIP" "gemini not on PATH or --skip-gemini"
fi

# Stage 7: Meta-skill discovery
if [ "$SKIP_CLAUDE" = "0" ] && command -v claude >/dev/null 2>&1; then
  echo "Stage 7: Claude meta-skill awareness"
  OUT="$(claude -p "How do I add a new context module to this repo? Cite the file you used." 2>&1 || true)"
  echo "$OUT" > "$RESULTS_DIR/$TIMESTAMP-claude-meta.txt"
  if grep -q "authoring-modules" "$RESULTS_DIR/$TIMESTAMP-claude-meta.txt"; then
    log_stage "Stage 7 meta-skill" "PASS" "Claude cited authoring-modules.md"
  else
    log_stage "Stage 7 meta-skill" "FAIL" "Claude did not cite meta-skill references"
  fi
fi

echo ""
echo "Report written to: $REPORT"
cat "$REPORT"
```

Make executable: `chmod +x scripts/gauntlet/run.sh`

- [ ] **Step 3: Add `pnpm gauntlet` script to root `package.json`**

```json
"scripts": {
  "gauntlet": "bash scripts/gauntlet/run.sh"
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/gauntlet/ package.json
git commit -m "feat(gauntlet): cross-CLI skill discovery test harness"
```

---

### Task 26: Run gauntlet, capture results, commit

**Files:**
- Create: `examples/gauntlet/results/<timestamp>.md` and adjacent `<timestamp>-{claude,codex,gemini,claude-meta}.txt`

- [ ] **Step 1: Ensure all CLIs are installed and authenticated**

Pre-flight check:
```bash
which claude && claude --version
which codex && codex --version
which gemini && gemini --version
```

If any are missing or unauthenticated, run gauntlet with `--skip-*` for that CLI and document in results.

- [ ] **Step 2: Run gauntlet**

```bash
cd ~/ai-context-kit
pnpm gauntlet
```

Output streams to terminal AND writes to `examples/gauntlet/results/<timestamp>.md`.

- [ ] **Step 3: Review results, fix any failures**

For each failing stage:
- Stage 1–3 failures: bug in kit code. Diagnose, fix in the relevant source file, recommit, rerun gauntlet.
- Stage 4–7 failures: CLI invocation issue, env var missing, or skill description not matching agent's auto-load heuristics. Adjust skill `description` text to be more keyword-rich; rerun.

Iterate until at least Stage 1–3 pass and at least one CLI from Stage 4–6 passes. Stage 7 should pass if any CLI passed Stage 4–6.

- [ ] **Step 4: Commit gauntlet results**

```bash
git add examples/gauntlet/results/
git commit -m "test(gauntlet): empirical validation results for v1.0"
```

---

## Phase J — Release

### Task 27: Create changeset, run full test suite, prepare for PR

**Files:**
- Create: `.changeset/skills-and-context-injection.md`

- [ ] **Step 1: Run full test suite + typecheck + lint**

```bash
cd ~/ai-context-kit
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

Fix any failures inline. Re-run until clean.

- [ ] **Step 2: Run `ai-context verify` on the gauntlet fixture**

```bash
cd examples/gauntlet
node ../../packages/cli/dist/index.js verify
```

Expected: PASS.

- [ ] **Step 3: Create changeset**

```bash
cd ~/ai-context-kit
pnpm changeset
```

Interactive prompts: select all four packages (`@timothycrooker/ai-context-{core,cli,templates,config}`), bump type `major`. Body:

```markdown
Add first-class cross-CLI skills + context injection.

**New:**
- `.ai/skills/<name>/` directory-tree skill authoring (SKILL.md + optional references/, scripts/, assets/)
- Double-symlink emission to `.agents/skills/<name>` (Codex, Gemini, Cursor, Goose, OpenCode, Aider, +18 other agents.md-compatible tools) and `.claude/skills/<name>` (Claude Code)
- Monorepo per-scope skills via frontmatter `scope: [api, web]`
- Windows copy-fallback with `_generated:` banner
- `ai-context skills create` and `ai-context skills list` subcommands
- `ai-context init --upgrade` for adding skills to existing 0.3.x repos without overwriting content
- Kit's own `ai-context-kit` meta-skill installed in every consuming repo
- Lean kit-awareness stanza in generated `AGENTS.md`/`CLAUDE.md` pointing agents at the meta-skill

**Backward compatibility:**
Manifests without a `skills` block behave exactly as 0.3.x. Existing CLAUDE.md/AGENTS.md generation unchanged. `.claude/rules/*.md` generation unchanged.

**Validation:**
Empirically validated via `examples/gauntlet/` exercising every skill shape (plain SKILL.md, with-refs, with-scripts, scoped, router) across headless Claude/Codex/Gemini invocations. Results committed at `examples/gauntlet/results/`.
```

- [ ] **Step 4: Commit changeset**

```bash
git add .changeset/
git commit -m "chore: changeset for 1.0.0"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin feat/skills-and-cross-cli-context-injection
```

- [ ] **Step 6: Open PR via gh**

```bash
gh pr create --title "feat: skills + cross-CLI context injection (1.0.0)" --body "$(cat <<'EOF'
## Summary

- Add first-class skill authoring via `.ai/skills/<name>/` directory trees
- Double-symlink emission to `.agents/skills/` (Codex, Gemini, +20 other agents.md tools) and `.claude/skills/` (Claude Code)
- Ship `ai-context-kit` meta-skill into every consuming repo for self-explanation to agents
- Validate empirically via `examples/gauntlet/` harness

## Spec
[docs/superpowers/specs/2026-05-25-skills-and-context-injection-design.md](docs/superpowers/specs/2026-05-25-skills-and-context-injection-design.md)

## Plan
[docs/superpowers/plans/2026-05-25-skills-and-context-injection.md](docs/superpowers/plans/2026-05-25-skills-and-context-injection.md)

## Validation

Gauntlet results: `examples/gauntlet/results/<timestamp>.md`. See for per-CLI pass/fail.

## Test plan

- [x] All unit tests pass (`pnpm test`)
- [x] Typecheck clean (`pnpm typecheck`)
- [x] Format/lint clean
- [x] Gauntlet emission stages 1-3 pass
- [x] At least one CLI gauntlet stage (4/5/6) passes
- [x] Meta-skill stage 7 passes for at least one CLI
- [x] Backward compatibility verified (manifest without `skills` block produces 0.3.x output)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: After PR merge, version + publish (manual)**

These steps happen AFTER human review and PR merge to `main`:

1. Changesets GitHub Action opens a "Version Packages" PR automatically. Review + merge it.
2. `pnpm release` (run by changesets workflow on merge) publishes all four packages to npm as 1.0.0 with provenance.
3. The existing `release-preflight.mjs` + `npm view` polling verifies post-publish visibility.
4. GitHub release auto-created from changeset summary.
5. (Optional) tag manually if changesets didn't: `git tag v1.0.0 && git push --tags`.

---

## Self-review

**Spec coverage (every section traced to a task):**
- §1 Summary — context only
- §2 Motivation — context only
- §3 Mental model — Task 1 (types) + Task 13 (stanza) + Task 18 (meta-skill body) + Task 22 (docs)
- §4.1 Source layout — Task 1 + Task 24
- §4.2 Skill directory contents — Task 2 (validator) + Task 3 (discovery) + Task 21 (template bundler)
- §4.3 Symlink emission contract — Tasks 5, 6, 8, 9
- §4.4 Monorepo scoping — Task 8 (plan with scope expansion) + Task 11 (engine integration)
- §4.5 Windows fallback — Task 7 + Task 9
- §5 Manifest schema — Task 1 (schema in templates) + Task 4 (load + validate)
- §6 CLI changes — Tasks 14, 15, 16, 17
- §7 Meta-skill — Tasks 18, 19, 20, 21
- §8 Context injection stanza — Task 13
- §9 Backward compat — Task 4 (manifest without skills), Task 11 (skip when absent), Task 13 (stanza only when present)
- §10 Validation harness — Tasks 24, 25, 26
- §11 Release plan — Task 27
- §12 Out of scope — explicit
- §13 Risks — covered by design + tests

**Placeholder scan:** no TBDs / TODOs / "add appropriate handling" / vague language. Every step has concrete code or commands. The "exact Codex headless invocation" was flagged in §10.2 stage 4 of the spec as the first implementation-time question — addressed in Task 25 with the `codex exec ...` invocation (verified against current Codex CLI docs but pinned-by-version in the gauntlet README from Task 25 Step 1).

**Type consistency:**
- `SkillFrontmatter` defined in Task 1, used in Tasks 2, 3, 8.
- `SkillSource` defined in Task 1, used in Tasks 3, 8, 11.
- `SkillMirrorPlan` defined in Task 1, used in Tasks 8, 9.
- `SkillsManifestBlock` defined in Task 1, used in Tasks 4, 8.
- Function names consistent: `parseSkillFrontmatter`, `discoverSkills`, `computeSymlinkTarget`, `createMirrorSymlink`, `createMirrorCopy`, `planSkillMirrors`, `applySkillMirrors`, `findOrphanedSkillMirrors`. All re-exported in Task 11.
- Error codes consistent: all use `AICTX_SKILL_*` prefix.

**Frequent commit checkpoints:** every task ends with a commit. Estimated 27 commits on the branch.

---
