import fs from "node:fs";
import path from "node:path";
import { ContextError } from "./errors.js";
import { readUtf8, createSymlink, isSymlink, readSymlink, removeSymlink, copyDirRecursive, restoreExecBits, writeUtf8 } from "./io.js";
import { parseFrontMatter } from "./front-matter.js";
import { toPosix } from "./path-utils.js";
import type { SkillFrontmatter, SkillSource } from "./types.js";

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

export function computeSymlinkTarget(mirrorPath: string, sourcePath: string): string {
  const relative = path.relative(path.dirname(mirrorPath), sourcePath);
  return toPosix(relative);
}

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
