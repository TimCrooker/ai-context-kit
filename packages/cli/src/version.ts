import fs from "node:fs";

interface PkgJson {
  version?: unknown;
}

const FALLBACK_VERSION = "0.0.0-unknown";

export function resolveCliVersion(packageJsonUrl = new URL("../package.json", import.meta.url)): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonUrl, "utf8")) as PkgJson;
    if (typeof parsed.version === "string" && parsed.version.trim().length > 0) {
      return parsed.version.trim();
    }
  } catch {
    return FALLBACK_VERSION;
  }
  return FALLBACK_VERSION;
}
