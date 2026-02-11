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
