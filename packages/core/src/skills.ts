import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ContextError } from "./errors.js";
import {
  readUtf8,
  createSymlink,
  isSymlink,
  readSymlink,
  removeSymlink,
  copyDirRecursive,
  restoreExecBits,
  writeUtf8,
} from "./io.js";
import { parseFrontMatter } from "./front-matter.js";
import { toPosix } from "./path-utils.js";
import type {
  SkillFrontmatter,
  SkillSource,
  Manifest,
  SkillMirrorPlan,
} from "./types.js";

// Lowercase alphanumerics + single hyphens; no leading/trailing hyphen, no consecutive hyphens.
const SKILL_NAME_PATTERN = /^[a-z0-9](?:-?[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

export function parseSkillFrontmatter(
  raw: string,
  expectedName: string,
  sourcePath: string,
): SkillFrontmatter {
  const { meta } = parseFrontMatter(raw, sourcePath);

  const name = meta.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new ContextError(
      "AICTX_SKILL_FRONTMATTER_INVALID",
      `Skill name is required in ${sourcePath}`,
    );
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ContextError(
      "AICTX_SKILL_NAME_INVALID",
      `Skill name '${name}' exceeds ${MAX_NAME_LENGTH} chars (${sourcePath})`,
    );
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new ContextError(
      "AICTX_SKILL_NAME_INVALID",
      `Skill '${name}' has invalid name pattern in ${sourcePath} (must be [a-z0-9-], no leading/trailing/consecutive hyphens)`,
    );
  }
  if (name !== expectedName) {
    throw new ContextError(
      "AICTX_SKILL_NAME_INVALID",
      `Skill name '${name}' does not match directory '${expectedName}' in ${sourcePath}`,
    );
  }

  const description = meta.description;
  if (typeof description !== "string" || description.length === 0) {
    throw new ContextError(
      "AICTX_SKILL_FRONTMATTER_INVALID",
      `Skill description is required in ${sourcePath}`,
    );
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ContextError(
      "AICTX_SKILL_FRONTMATTER_INVALID",
      `Skill description exceeds ${MAX_DESCRIPTION_LENGTH} chars in ${sourcePath}`,
    );
  }

  let scope: string[] | undefined;
  if (meta.scope !== undefined) {
    if (!Array.isArray(meta.scope)) {
      throw new ContextError(
        "AICTX_SKILL_FRONTMATTER_INVALID",
        `Skill scope must be an array in ${sourcePath}`,
      );
    }
    for (const entry of meta.scope) {
      if (typeof entry !== "string") {
        throw new ContextError(
          "AICTX_SKILL_FRONTMATTER_INVALID",
          `Skill scope entries must be strings in ${sourcePath}`,
        );
      }
    }
    scope = meta.scope as string[];
  }

  const agents = parseAgentList(meta.agents, "agents", sourcePath);
  const excludeAgents = parseAgentList(
    meta.excludeAgents,
    "excludeAgents",
    sourcePath,
  );
  if (agents !== undefined && excludeAgents !== undefined) {
    throw new ContextError(
      "AICTX_SKILL_FRONTMATTER_INVALID",
      `Skill declares both agents and excludeAgents in ${sourcePath}; use one or the other`,
    );
  }
  if (agents !== undefined && agents.length === 0) {
    throw new ContextError(
      "AICTX_SKILL_FRONTMATTER_INVALID",
      `Skill agents whitelist is empty in ${sourcePath}; it would emit nowhere. Remove the field to emit to all agents.`,
    );
  }

  return {
    ...(meta as Record<string, unknown>),
    name,
    description,
    scope,
    agents,
    excludeAgents,
  } as SkillFrontmatter;
}

function parseAgentList(
  value: unknown,
  field: "agents" | "excludeAgents",
  sourcePath: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ContextError(
      "AICTX_SKILL_FRONTMATTER_INVALID",
      `Skill ${field} must be an array in ${sourcePath}`,
    );
  }
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new ContextError(
        "AICTX_SKILL_FRONTMATTER_INVALID",
        `Skill ${field} entries must be non-empty strings in ${sourcePath}`,
      );
    }
  }
  return value as string[];
}

/**
 * Agent ID for a mirror path: first path segment minus its leading dot.
 * ".claude/skills" → "claude", ".agents/skills" → "agents", ".cursor/skills" → "cursor".
 */
export function mirrorAgentId(mirrorPath: string): string {
  const first =
    toPosix(mirrorPath).replace(/^\.\//, "").split("/")[0] ?? mirrorPath;
  return first.replace(/^\./, "");
}

export function discoverSkills(cwd: string, sourceDir: string): SkillSource[] {
  const absSourceDir = path.isAbsolute(sourceDir)
    ? sourceDir
    : path.join(cwd, sourceDir);
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
        `SKILL.md not found in ${dir}`,
      );
    }

    const raw = readUtf8(skillMdPath);
    const frontmatter = parseSkillFrontmatter(raw, entry.name, skillMdPath);

    results.push({ name: entry.name, dir, skillMdPath, frontmatter });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

export function computeSymlinkTarget(
  mirrorPath: string,
  sourcePath: string,
): string {
  const relative = path.relative(path.dirname(mirrorPath), sourcePath);
  return toPosix(relative);
}

export function createMirrorSymlink(
  sourceDir: string,
  mirrorPath: string,
): void {
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
        `Cannot create skill mirror at ${mirrorPath}: a real file or directory exists there. Either delete it or move skill source elsewhere.`,
      );
    }
  }

  createSymlink(expectedTarget, mirrorPath);
}

const COPY_BANNER_PREFIX = "<!-- _generated: do not edit here.";

export function createMirrorCopy(
  sourceDir: string,
  mirrorPath: string,
  repoRoot?: string,
): void {
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

export function planSkillMirrors(
  repoRoot: string,
  manifest: Manifest,
  skills: SkillSource[],
): SkillMirrorPlan[] {
  if (!manifest.skills) return [];

  const targetIds = Object.keys(manifest.targets);
  const scopeTargets = Object.fromEntries(
    Object.entries(manifest.targets)
      .filter(([id]) => id !== "root")
      .map(([id, agentsPath]) => [
        id,
        path.posix.dirname(agentsPath.split(path.sep).join("/")),
      ]),
  );

  const agentIds = manifest.skills.mirrors.map((m) => mirrorAgentId(m));

  const plans: SkillMirrorPlan[] = [];

  for (const skill of skills) {
    const { agents, excludeAgents } = skill.frontmatter;
    for (const id of [...(agents ?? []), ...(excludeAgents ?? [])]) {
      if (!agentIds.includes(id)) {
        throw new ContextError(
          "AICTX_SKILL_AGENT_UNKNOWN",
          `Skill '${skill.name}' references unknown agent '${id}'; known agents from manifest mirrors: ${agentIds.join(", ")}`,
        );
      }
    }
    const mirrors = manifest.skills.mirrors.filter((m) => {
      const id = mirrorAgentId(m);
      if (agents !== undefined) return agents.includes(id);
      if (excludeAgents !== undefined) return !excludeAgents.includes(id);
      return true;
    });

    const scope = skill.frontmatter.scope ?? [];
    const explicitWildcard = scope.includes("*");
    const scopeIds = explicitWildcard
      ? targetIds.filter((id) => id !== "root")
      : scope;

    for (const scopeId of scopeIds) {
      if (scopeId === "*") continue;
      if (scopeId === "root") {
        throw new ContextError(
          "AICTX_SKILL_SCOPE_UNKNOWN",
          `Skill '${skill.name}' uses 'root' in scope; the implicit root emission is already enabled by omitting scope. Either remove 'root' or use scope: ["*"] for root + all scopes.`,
        );
      }
      if (!targetIds.includes(scopeId)) {
        throw new ContextError(
          "AICTX_SKILL_SCOPE_UNKNOWN",
          `Skill '${skill.name}' references undefined scope '${scopeId}'`,
        );
      }
    }

    const emissionRoots: string[] = [];
    if (scope.length === 0 || explicitWildcard) {
      emissionRoots.push(repoRoot);
    }
    if (explicitWildcard) {
      for (const id of targetIds) {
        if (id === "root") continue;
        emissionRoots.push(path.join(repoRoot, scopeTargets[id]!));
      }
    } else {
      for (const id of scope) {
        if (id === "*") continue;
        emissionRoots.push(path.join(repoRoot, scopeTargets[id]!));
      }
    }

    for (const root of emissionRoots) {
      for (const mirror of mirrors) {
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
  options: ApplyMirrorOptions = {},
): ApplyMirrorResult {
  const written: SkillMirrorPlan[] = [];
  const fallbackToCopy: SkillMirrorPlan[] = [];
  const failed: { plan: SkillMirrorPlan; reason: string }[] = [];

  const forceFallback =
    options.forceCopy === true ||
    process.env.AI_CONTEXT_FORCE_COPY_FALLBACK === "1";

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
        if (
          error instanceof ContextError &&
          error.code === "AICTX_SKILL_MIRROR_CONFLICT"
        ) {
          throw error;
        }
        createMirrorCopy(plan.source, plan.mirror, options.repoRoot);
        fallbackToCopy.push({ ...plan, mode: "copy" });
      }
    } catch (error) {
      const reason =
        error instanceof ContextError
          ? `[${error.code}] ${error.message}`
          : String(error);
      failed.push({ plan, reason });
    }
  }

  return { written, fallbackToCopy, failed };
}

export function findOrphanedSkillMirrors(
  repoRoot: string,
  manifest: Manifest,
  activeSkillNames: string[],
  plannedMirrors?: string[],
): string[] {
  if (!manifest.skills) return [];

  const active = new Set(activeSkillNames);
  const planned =
    plannedMirrors === undefined ? undefined : new Set(plannedMirrors);
  const orphans: string[] = [];

  const mirrorBases: string[] = [];
  for (const m of manifest.skills.mirrors) {
    mirrorBases.push(path.join(repoRoot, m));
  }
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
      if (!isSymlink(full)) continue;
      // Plan-aware: a mirror whose exact path is not planned is orphaned even when
      // its skill still exists (e.g. it was excluded via an agents/excludeAgents filter).
      const orphaned =
        planned !== undefined ? !planned.has(full) : !active.has(entry.name);
      if (orphaned) {
        orphans.push(full);
      }
    }
  }

  return orphans.sort();
}
