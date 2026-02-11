#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PACKAGES_DIR = path.join(ROOT, "packages");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fail(message) {
  console.error(`preflight error: ${message}`);
  process.exitCode = 1;
}

const packageDirs = fs
  .readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(PACKAGES_DIR, entry.name))
  .sort((a, b) => a.localeCompare(b));

for (const pkgDir of packageDirs) {
  const pkgPath = path.join(pkgDir, "package.json");
  const pkg = readJson(pkgPath);
  const name = pkg.name;
  const version = pkg.version;

  if (typeof name !== "string" || name.length === 0) {
    fail(`${pkgPath} missing package name`);
    continue;
  }
  if (typeof version !== "string" || version.length === 0) {
    fail(`${name} missing version`);
    continue;
  }

  const dependencyGroups = [
    ["dependencies", pkg.dependencies ?? {}],
    ["peerDependencies", pkg.peerDependencies ?? {}],
    ["optionalDependencies", pkg.optionalDependencies ?? {}]
  ];

  for (const [group, deps] of dependencyGroups) {
    for (const [depName, depVersion] of Object.entries(deps)) {
      if (typeof depVersion === "string" && depVersion.includes("workspace:")) {
        fail(`${name} ${group}.${depName} uses workspace protocol (${depVersion})`);
      }
    }
  }

  const hasBuildScript = typeof pkg.scripts?.build === "string";
  if (hasBuildScript) {
    const distDir = path.join(pkgDir, "dist");
    if (!fs.existsSync(distDir)) {
      fail(`${name} missing dist/ after build`);
    }
  }
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}

console.log("release preflight passed");
