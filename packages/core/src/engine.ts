import fs from "node:fs";
import path from "node:path";
import {
  loadManifest,
  loadModules,
  loadScopeManifest,
  resolveManifestPath,
  validateScopeWiring
} from "./config.js";
import { computeDocChainBudget } from "./budget.js";
import { collectGeneratedOutputs } from "./render.js";
import { exists, readUtf8, removeFile, walkFiles, writeUtf8 } from "./io.js";
import { rel, toPosix } from "./path-utils.js";
import { ContextError } from "./errors.js";
import type {
  BuildOptions,
  BuildResult,
  DiffItem,
  DiffReport,
  InitOptions,
  Template,
  VerifyOptions,
  VerifyResult
} from "./types.js";

const GENERATED_MARKER = "Source: .ai/context/scopes.json";
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

function gatherGeneratedFiles(cwd: string): string[] {
  return walkFiles(cwd, SKIP_DIRS)
    .filter((abs) => {
      const base = path.basename(abs);
      return base === "AGENTS.md" || base === "CLAUDE.md";
    })
    .filter((abs) => readUtf8(abs).includes(GENERATED_MARKER))
    .map((abs) => rel(cwd, abs));
}

function writeOutputs(
  cwd: string,
  outputs: ReturnType<typeof collectGeneratedOutputs>,
  options: BuildOptions
): BuildResult {
  const result: BuildResult = {
    written: [],
    unchanged: [],
    removed: [],
    warnings: [],
    upToDate: true
  };

  for (const output of outputs) {
    const abs = path.join(cwd, output.path);
    const hasExisting = exists(abs);
    const existing = hasExisting ? readUtf8(abs) : null;
    if (existing === output.content) {
      result.unchanged.push(output.path);
      continue;
    }

    result.upToDate = false;
    if (!options.check && !options.dryRun) {
      writeUtf8(abs, output.content);
      result.written.push(output.path);
    } else {
      result.written.push(output.path);
    }
  }

  if (options.removeOrphans) {
    const expected = new Set(outputs.map((o) => o.path));
    const generatedFiles = gatherGeneratedFiles(cwd);
    for (const generated of generatedFiles) {
      if (generated === "CLAUDE.md" || generated === "AGENTS.md") {
        continue;
      }
      if (!expected.has(generated)) {
        result.upToDate = false;
        if (!options.check && !options.dryRun) {
          removeFile(path.join(cwd, generated));
        }
        result.removed.push(generated);
      }
    }
  }

  return result;
}

function buildInternal(cwd: string, options: BuildOptions): BuildResult {
  const manifest = loadManifest(cwd, options.manifestPath);
  const scopeManifest = loadScopeManifest(cwd, manifest);
  const modules = loadModules(cwd, manifest);
  const wiring = validateScopeWiring(cwd, manifest, scopeManifest);
  const outputs = collectGeneratedOutputs(cwd, manifest, scopeManifest, modules);
  const result = writeOutputs(cwd, outputs, options);
  result.warnings.push(...wiring.warnings);
  return result;
}

export function buildAll(cwd: string, options: BuildOptions = {}): BuildResult {
  return buildInternal(cwd, options);
}

export function diffGenerated(cwd: string, options: BuildOptions = {}): DiffReport {
  const manifest = loadManifest(cwd, options.manifestPath);
  const scopeManifest = loadScopeManifest(cwd, manifest);
  const modules = loadModules(cwd, manifest);
  validateScopeWiring(cwd, manifest, scopeManifest);
  const outputs = collectGeneratedOutputs(cwd, manifest, scopeManifest, modules);

  const items: DiffItem[] = [];
  for (const output of outputs) {
    const abs = path.join(cwd, output.path);
    if (!exists(abs)) {
      items.push({ path: output.path, type: "create" });
      continue;
    }
    if (readUtf8(abs) !== output.content) {
      items.push({ path: output.path, type: "update" });
    }
  }

  const expected = new Set(outputs.map((o) => o.path));
  const generatedFiles = gatherGeneratedFiles(cwd);
  for (const generated of generatedFiles) {
    if (generated === "AGENTS.md" || generated === "CLAUDE.md") {
      continue;
    }
    if (!expected.has(generated)) {
      items.push({ path: generated, type: "delete" });
    }
  }

  items.sort((a, b) => a.path.localeCompare(b.path));
  return { items };
}

export function verifyAll(cwd: string, options: VerifyOptions = {}): VerifyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let budgetReport: ReturnType<typeof computeDocChainBudget> = null;

  try {
    const buildResult = buildInternal(cwd, {
      manifestPath: options.manifestPath,
      check: true,
      dryRun: true,
      removeOrphans: false
    });

    warnings.push(...buildResult.warnings);

    if (!buildResult.upToDate) {
      errors.push("Generated outputs are out of date. Run: ai-context build");
    }

    const diff = diffGenerated(cwd, { manifestPath: options.manifestPath });
    const orphanDeletes = diff.items.filter((item) => item.type === "delete");
    if (orphanDeletes.length > 0) {
      errors.push(
        `Unmanaged generated files detected: ${orphanDeletes
          .map((item) => item.path)
          .join(", ")}`
      );
    }

    budgetReport = computeDocChainBudget(cwd);
    if (!budgetReport) {
      const msg = "No .codex/config.toml project_doc_max_bytes detected; skipping budget checks";
      if (options.strictCodexConfig) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    } else {
      for (const entry of budgetReport.entries) {
        if (entry.violations.length > 0) {
          errors.push(
            `${entry.docName} budget exceeded (${entry.maxBytes}): ${entry.violations
              .map((violation) => `${violation.directory}=${violation.totalBytes}`)
              .join(", ")}`
          );
        }
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown verify error while loading context";
    errors.push(message);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    budgetReport: budgetReport ?? undefined
  };
}

export function lintConfig(cwd: string, manifestPath?: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    const manifest = loadManifest(cwd, manifestPath);
    const scopes = loadScopeManifest(cwd, manifest);
    validateScopeWiring(cwd, manifest, scopes);
    loadModules(cwd, manifest);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Unknown lint-config error");
  }
  return { ok: errors.length === 0, errors };
}

export function doctor(cwd: string, manifestPath?: string): { issues: string[]; suggestions: string[] } {
  const issues: string[] = [];
  const suggestions: string[] = [];

  const manifestResolved = resolveManifestPath(cwd, manifestPath);
  if (!exists(manifestResolved)) {
    issues.push(`Missing manifest at ${toPosix(path.relative(cwd, manifestResolved))}`);
    suggestions.push("Run: ai-context init");
    return { issues, suggestions };
  }

  const verify = verifyAll(cwd, { manifestPath });
  issues.push(...verify.errors);

  if (verify.warnings.length > 0) {
    suggestions.push(...verify.warnings);
  }

  if (issues.length === 0) {
    suggestions.push("System looks healthy. Run ai-context diff before major scope changes.");
  }

  return { issues, suggestions };
}

export function initProject(cwd: string, template: Template, options: InitOptions = {}): string[] {
  const written: string[] = [];

  for (const file of template.files) {
    const abs = path.join(cwd, file.path);
    if (fs.existsSync(abs) && !options.force) {
      throw new ContextError(
        `Refusing to overwrite existing file without --force: ${toPosix(path.relative(cwd, abs))}`
      );
    }
    writeUtf8(abs, file.content.endsWith("\n") ? file.content : `${file.content}\n`);
    written.push(file.path);
  }

  return written.sort((a, b) => a.localeCompare(b));
}
