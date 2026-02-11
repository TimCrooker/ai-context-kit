import fs from "node:fs";
import path from "node:path";
import { walkFiles } from "./io.js";
import { toPosix } from "./path-utils.js";
import type { BudgetChainEntry, BudgetReport, BudgetSummary } from "./types.js";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".turbo",
  ".next",
  ".expo",
  ".idea",
  ".vscode"
]);

function parseProjectDocMaxBytes(cwd: string): number | null {
  const configPath = path.join(cwd, ".codex/config.toml");
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const content = fs.readFileSync(configPath, "utf8");
  const match = content.match(/^\s*project_doc_max_bytes\s*=\s*(\d+)\s*$/m);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function gatherDocScopeDirs(cwd: string, docName: "AGENTS" | "CLAUDE"): string[] {
  const files = walkFiles(cwd, SKIP_DIRS)
    .filter((abs) => {
      const base = path.basename(abs);
      return base === `${docName}.md` || base === `${docName}.override.md`;
    })
    .map((abs) => toPosix(path.relative(cwd, abs)));

  const dirs = new Set(files.map((file) => path.posix.dirname(file)));
  return [...dirs]
    .map((dir) => (dir === "." ? "." : dir))
    .sort((a, b) => a.localeCompare(b));
}

function computeChainBytes(cwd: string, relDir: string, docName: "AGENTS" | "CLAUDE"): number {
  let total = 0;

  function addIfPresent(relPath: string): void {
    const abs = path.join(cwd, relPath);
    if (fs.existsSync(abs)) {
      total += fs.readFileSync(abs, "utf8").length;
    }
  }

  addIfPresent(`${docName}.override.md`);
  addIfPresent(`${docName}.md`);

  if (relDir !== ".") {
    const parts = relDir.split("/");
    let prefix = "";
    for (const part of parts) {
      prefix = prefix ? `${prefix}/${part}` : part;
      addIfPresent(`${prefix}/${docName}.override.md`);
      addIfPresent(`${prefix}/${docName}.md`);
    }
  }

  return total;
}

function summarize(cwd: string, docName: "AGENTS" | "CLAUDE", maxBytes: number): BudgetSummary {
  const scopeDirs = gatherDocScopeDirs(cwd, docName);
  const chains: BudgetChainEntry[] = scopeDirs.map((directory) => ({
    directory,
    totalBytes: computeChainBytes(cwd, directory, docName)
  }));

  const worst = chains.reduce(
    (currentWorst, chain) => (chain.totalBytes > currentWorst.totalBytes ? chain : currentWorst),
    { directory: ".", totalBytes: 0 }
  );

  const violations = chains.filter((entry) => entry.totalBytes > maxBytes);

  return {
    docName,
    maxBytes,
    worst,
    violations
  };
}

export function computeDocChainBudget(
  cwd: string,
  options?: { maxBytes?: number }
): BudgetReport | null {
  const maxBytes = options?.maxBytes ?? parseProjectDocMaxBytes(cwd);
  if (!maxBytes) {
    return null;
  }

  return {
    entries: [summarize(cwd, "AGENTS", maxBytes), summarize(cwd, "CLAUDE", maxBytes)]
  };
}
