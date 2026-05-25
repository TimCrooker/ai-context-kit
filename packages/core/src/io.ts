import fs from "node:fs";
import path from "node:path";

export function readUtf8(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

export function exists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function ensureDirForFile(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function writeUtf8(filePath: string, content: string): void {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, content, "utf8");
}

export function removeFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function walkFiles(root: string, skipDirs: Set<string>): string[] {
  const collected: string[] = [];

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) {
          continue;
        }
        walk(abs);
        continue;
      }
      if (entry.isFile()) {
        collected.push(abs);
      }
    }
  }

  walk(root);
  return collected;
}

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
