import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./config.js";
import { ContextError } from "./errors.js";
import { createSymlink, isSymlink, readSymlink } from "./io.js";
import { computeSymlinkTarget } from "./skills.js";
import type {
  MigrateActionType,
  MigrateCurrentState,
  MigrateEntry,
  MigratePlan,
  SkillsManifestBlock,
} from "./types.js";

const DEFAULT_SKILLS_CONFIG: SkillsManifestBlock = {
  source: ".ai/skills",
  mirrors: [".agents/skills", ".claude/skills"],
  metaSkill: true,
};

function readKitVersion(): string {
  try {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(fs.readFileSync(fileURLToPath(pkgUrl), "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function classifyEntry(
  cwd: string,
  entryRelPath: string,
  name: string
): MigrateCurrentState {
  const abs = path.join(cwd, entryRelPath);

  // Symlink check (lstat-based, must come before isDirectory)
  if (isSymlink(abs)) {
    const target = readSymlink(abs) ?? "";
    const targetAbs = path.resolve(path.dirname(abs), target);
    const targetRel = path.relative(cwd, targetAbs).split(path.sep).join("/");
    if (targetRel.startsWith(".ai/skills/")) {
      return {
        type: "already_kit_managed",
        path: entryRelPath,
        current_target: target,
        underlying_source: targetRel,
      };
    }
    return {
      type: "existing_symlink",
      path: entryRelPath,
      current_target: target,
      underlying_source: targetRel,
    };
  }

  const stat = fs.statSync(abs);

  // Regular file
  if (stat.isFile()) {
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
        target,
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
        rationale:
          "Non-skill content (README, stray file, or directory without SKILL.md); preserved as-is.",
      };
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
  } catch {
    warnings.push(
      "Could not load manifest. Plan uses default skills config (.ai/skills source, .agents+.claude mirrors)."
    );
    skillsConfig = DEFAULT_SKILLS_CONFIG;
  }

  const claudeSkillsDir = path.join(cwd, ".claude/skills");
  const entries: MigrateEntry[] = [];

  if (fs.existsSync(claudeSkillsDir)) {
    const dirents = fs.readdirSync(claudeSkillsDir, { withFileTypes: true });
    for (const dirent of dirents) {
      if (dirent.name.startsWith(".")) continue;
      const entryRelPath = path
        .relative(cwd, path.join(claudeSkillsDir, dirent.name))
        .split(path.sep)
        .join("/");
      const name = dirent.name.endsWith(".md") ? dirent.name.slice(0, -3) : dirent.name;
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

  const plan: MigratePlan = {
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
  };
  if (warnings.length > 0) plan.warnings = warnings;
  return plan;
}

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
      `Migration plan not found at ${MIGRATE_PLAN_REL_PATH}. Run 'ai-context migrate plan' first.`
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

export function checkApplyPreconditions(cwd: string): void {
  // 1. Git repo check
  try {
    execSync("git rev-parse --git-dir", { cwd, stdio: "pipe" });
  } catch {
    throw new ContextError(
      "AICTX_MIGRATE_NOT_GIT_REPO",
      `${cwd} is not a git repository. Migrate requires git for safe history-preserving moves.`
    );
  }

  // 2. Clean tree
  const status = execSync("git status --porcelain", { cwd }).toString().trim();
  if (status.length > 0) {
    throw new ContextError(
      "AICTX_MIGRATE_DIRTY_TREE",
      `Git working tree is not clean. Commit or stash changes before running migrate apply.\n${status}`
    );
  }

  // 3. Manifest has skills block
  try {
    const manifest = loadManifest(cwd);
    if (!manifest.skills) {
      throw new ContextError(
        "AICTX_MIGRATE_NO_SKILLS_BLOCK",
        `Manifest at .ai/context/manifest.json has no 'skills' block. Run 'ai-context init --upgrade' first.`
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
  gitMv(cwd, entry.current_state.path, entry.target.source);
  for (const mirrorRel of entry.target.mirrors) {
    createMirrorLink(cwd, mirrorRel, entry.target.source);
  }
  gitCommit(cwd, `chore(migrate): move_dir ${entry.name}\n\n${entry.rationale}`);
}

export function executePromoteBareMd(cwd: string, entry: MigrateEntry): void {
  const sourcePath = entry.current_state.path;
  const targetSkillMd = path.join(entry.target.source, "SKILL.md");

  const origContent = fs.readFileSync(path.join(cwd, sourcePath), "utf8");
  ensureDir(cwd, entry.target.source);

  const hasFrontmatter = /^---\n[\s\S]*?\n---\n/.test(origContent);
  let newContent: string;
  if (hasFrontmatter) {
    newContent = origContent;
  } else {
    const description = `Migrated from legacy slash-command at ${sourcePath}.`;
    newContent = `---\nname: ${entry.name}\ndescription: ${description}\n---\n\n${origContent.trimStart()}`;
  }

  fs.writeFileSync(path.join(cwd, targetSkillMd), newContent, "utf8");
  fs.unlinkSync(path.join(cwd, sourcePath));

  execSync(`git add -A`, { cwd });

  for (const mirrorRel of entry.target.mirrors) {
    createMirrorLink(cwd, mirrorRel, entry.target.source);
  }

  gitCommit(cwd, `chore(migrate): promote_bare_md ${entry.name}\n\n${entry.rationale}`);
}
