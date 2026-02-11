import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveCliVersion } from "../src/version.js";

describe("resolveCliVersion", () => {
  it("reads version from package.json by default", () => {
    const version = resolveCliVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("returns fallback version when package json is invalid", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-context-version-"));
    const pkg = path.join(tmpDir, "package.json");
    fs.writeFileSync(pkg, "{broken", "utf8");

    const version = resolveCliVersion(pathToFileURL(pkg));
    expect(version).toBe("0.0.0-unknown");
  });
});
