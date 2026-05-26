import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./config.js";
import { isSymlink, readSymlink } from "./io.js";
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
