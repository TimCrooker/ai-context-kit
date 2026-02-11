import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function fixturePath(): string {
  return path.resolve(process.cwd(), "../../examples/listforge-like");
}

export function copyFixture(): string {
  const fixture = fixturePath();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-context-kit-"));
  fs.cpSync(fixture, tempDir, { recursive: true });
  return tempDir;
}
