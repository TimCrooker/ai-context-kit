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
