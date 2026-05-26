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
import { lintContent } from "./content-lint.js";
import { exists, isSymlink, readSymlink, readUtf8, removeFile, walkFiles, writeUtf8 } from "./io.js";
import { rel, toPosix } from "./path-utils.js";
import { ContextError, formatContextError } from "./errors.js";
import {
  applySkillMirrors,
  computeSymlinkTarget,
  discoverSkills,
  findOrphanedSkillMirrors,
  planSkillMirrors,
} from "./skills.js";
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
    .filter((abs) => abs.endsWith(".md"))
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

  if (manifest.skills) {
    const skills = discoverSkills(cwd, manifest.skills.source);
    const plans = planSkillMirrors(cwd, manifest, skills);
    const activeNames = skills.map((s) => s.name);

    if (!options.dryRun && !options.check) {
      const apply = applySkillMirrors(plans, { repoRoot: cwd });
      for (const plan of apply.written) {
        result.written.push(path.relative(cwd, plan.mirror));
      }
      for (const plan of apply.fallbackToCopy) {
        result.written.push(path.relative(cwd, plan.mirror));
        result.warnings.push(
          `Skill mirror at ${path.relative(cwd, plan.mirror)} used copy-fallback (no symlink support)`
        );
      }
      for (const fail of apply.failed) {
        result.warnings.push(`Skill mirror failed: ${fail.reason}`);
      }
      if (options.removeOrphans) {
        const orphans = findOrphanedSkillMirrors(cwd, manifest, activeNames);
        for (const orphan of orphans) {
          fs.unlinkSync(orphan);
          result.removed.push(path.relative(cwd, orphan));
        }
      }
    } else {
      // dryRun / check: predict what would change without touching disk
      for (const plan of plans) {
        const rel = path.relative(cwd, plan.mirror);
        if (!fs.existsSync(plan.mirror)) {
          result.written.push(rel);
          result.upToDate = false;
          continue;
        }
        // Mirror exists; check that it's a symlink to the right target
        if (isSymlink(plan.mirror)) {
          const actual = readSymlink(plan.mirror);
          const expected = computeSymlinkTarget(plan.mirror, plan.source);
          if (actual !== expected) {
            result.written.push(rel);
            result.upToDate = false;
          }
        }
      }
      if (options.removeOrphans) {
        for (const orphan of findOrphanedSkillMirrors(cwd, manifest, activeNames)) {
          result.removed.push(path.relative(cwd, orphan));
        }
      }
    }
  }

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
    if (!expected.has(generated)) {
      items.push({ path: generated, type: "delete" });
    }
  }

  if (manifest.skills) {
    const skills = discoverSkills(cwd, manifest.skills.source);
    const plans = planSkillMirrors(cwd, manifest, skills);
    for (const plan of plans) {
      const relPath = path.relative(cwd, plan.mirror);
      if (!fs.existsSync(plan.mirror)) {
        items.push({ path: relPath, type: "create" });
      } else if (isSymlink(plan.mirror)) {
        const target = readSymlink(plan.mirror);
        const expected = computeSymlinkTarget(plan.mirror, plan.source);
        if (target !== expected) {
          items.push({ path: relPath, type: "update" });
        }
      }
    }
    const activeNames = skills.map((s) => s.name);
    for (const orphan of findOrphanedSkillMirrors(cwd, manifest, activeNames)) {
      items.push({ path: path.relative(cwd, orphan), type: "delete" });
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

    // Stronger check: detect wrong-target symlinks for skill mirrors
    try {
      const manifest = loadManifest(cwd, options.manifestPath);
      if (manifest.skills) {
        const skills = discoverSkills(cwd, manifest.skills.source);
        const plans = planSkillMirrors(cwd, manifest, skills);
        for (const plan of plans) {
          const relMirror = path.relative(cwd, plan.mirror);
          if (!fs.existsSync(plan.mirror)) {
            errors.push(`Skill mirror missing: ${relMirror}`);
            continue;
          }
          if (isSymlink(plan.mirror)) {
            const target = readSymlink(plan.mirror);
            const expected = computeSymlinkTarget(plan.mirror, plan.source);
            if (target !== expected) {
              errors.push(
                `Skill mirror points at wrong target: ${relMirror} → ${target} (expected ${expected})`
              );
            }
          }
        }
      }
    } catch (skillError) {
      errors.push(formatContextError(skillError));
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
    errors.push(formatContextError(error));
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
    if (manifest.skills) {
      const skills = discoverSkills(cwd, manifest.skills.source);
      planSkillMirrors(cwd, manifest, skills); // triggers AICTX_SKILL_SCOPE_UNKNOWN check
    }
  } catch (error) {
    errors.push(formatContextError(error));
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

  // Content quality lint (best-effort — don't fail doctor on lint errors)
  try {
    const manifest = loadManifest(cwd, manifestPath);
    const scopeManifest = loadScopeManifest(cwd, manifest);
    const modules = loadModules(cwd, manifest);
    const contentResult = lintContent(cwd, manifest, scopeManifest, modules);
    suggestions.push(...contentResult.suggestions);
  } catch {
    // content lint is best-effort
  }

  // Scan for broken skill mirror symlinks (handles case where source was deleted)
  try {
    const manifest = loadManifest(cwd, manifestPath);
    if (manifest.skills) {
      const skills = discoverSkills(cwd, manifest.skills.source);
      const activeNames = new Set(skills.map((s) => s.name));

      // Build list of mirror base directories to scan
      const mirrorBases: string[] = [];
      for (const m of manifest.skills.mirrors) {
        mirrorBases.push(path.join(cwd, m));
      }
      for (const [id, agentsPath] of Object.entries(manifest.targets)) {
        if (id === "root") continue;
        const scopeRoot = path.join(cwd, path.dirname(agentsPath));
        for (const m of manifest.skills.mirrors) {
          mirrorBases.push(path.join(scopeRoot, m));
        }
      }

      for (const base of mirrorBases) {
        if (!fs.existsSync(base)) continue;
        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
          const full = path.join(base, entry.name);
          if (!isSymlink(full)) continue;
          const target = readSymlink(full);
          if (target !== null) {
            const resolved = path.resolve(path.dirname(full), target);
            if (!fs.existsSync(resolved)) {
              issues.push(
                `Skill mirror broken (target missing): ${path.relative(cwd, full)}`
              );
              suggestions.push(`Run: ai-context build --remove-orphans`);
            }
          }
          if (!activeNames.has(entry.name)) {
            issues.push(
              `Orphan skill mirror: ${path.relative(cwd, full)} (no source at ${manifest.skills.source}/${entry.name}/)`
            );
          }
        }
      }

      // Per-plan checks for active skills
      const plans = planSkillMirrors(cwd, manifest, skills);
      for (const plan of plans) {
        if (!fs.existsSync(plan.mirror)) {
          issues.push(`Skill mirror missing: ${path.relative(cwd, plan.mirror)}`);
          suggestions.push(`Run: ai-context build`);
          continue;
        }
        if (isSymlink(plan.mirror)) {
          const target = readSymlink(plan.mirror);
          const expected = computeSymlinkTarget(plan.mirror, plan.source);
          if (target !== expected) {
            issues.push(
              `Skill mirror points to wrong target: ${path.relative(cwd, plan.mirror)} (got ${target}, expected ${expected})`
            );
            suggestions.push(`Run: ai-context build`);
          }
        }
      }
    }
  } catch {
    // skill doctor checks are best-effort
  }

  if (issues.length === 0 && suggestions.length === 0) {
    suggestions.push("System looks healthy. Run ai-context diff before major scope changes.");
  }

  return { issues, suggestions };
}

export function initProject(cwd: string, template: Template, options: InitOptions = {}): string[] {
  const written: string[] = [];

  for (const file of template.files) {
    const abs = path.join(cwd, file.path);
    const fileExists = fs.existsSync(abs);
    const isMetaSkillFile = file.path.startsWith(".ai/skills/ai-context-kit/");

    if (fileExists && !options.force) {
      if (options.upgrade) {
        if (isMetaSkillFile && options.refreshMetaSkill) {
          writeUtf8(abs, file.content.endsWith("\n") ? file.content : `${file.content}\n`);
          written.push(file.path);
        }
        continue; // skip existing files in upgrade mode
      }
      throw new ContextError(
        "AICTX_INIT_FAILED",
        `Refusing to overwrite existing file without --force: ${toPosix(path.relative(cwd, abs))}`
      );
    }

    writeUtf8(abs, file.content.endsWith("\n") ? file.content : `${file.content}\n`);
    written.push(file.path);
  }

  if (options.upgrade) {
    try {
      const buildResult = buildAll(cwd);
      for (const f of buildResult.written) {
        if (!written.includes(f)) written.push(f);
      }
    } catch {
      // non-fatal in upgrade mode
    }
  }

  return written.sort((a, b) => a.localeCompare(b));
}
