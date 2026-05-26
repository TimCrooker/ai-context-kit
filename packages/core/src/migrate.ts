import fs from "node:fs";
import path from "node:path";
import { isSymlink, readSymlink } from "./io.js";
import type { MigrateCurrentState, MigrateEntry, SkillsManifestBlock } from "./types.js";

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
