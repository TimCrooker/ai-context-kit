import fs from "node:fs";
import path from "node:path";
import { exists, readUtf8 } from "./io.js";
import { ContextError } from "./errors.js";
import { parseFrontMatter } from "./front-matter.js";
import { rel, toPosix } from "./path-utils.js";
import type { ContextModule, Manifest, ScopeDefinition, ScopeManifest } from "./types.js";

const DEFAULT_MANIFEST_PATH = ".ai/context/manifest.json";

function parseJsonFile<T>(filePath: string): T {
  return JSON.parse(readUtf8(filePath)) as T;
}

function asString(value: unknown, msg: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ContextError(msg);
  }
  return value.trim();
}

function asStringArray(value: unknown, msg: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ContextError(msg);
  }
  return value.map((item) => asString(item, msg));
}

export function resolveManifestPath(cwd: string, manifestPath?: string): string {
  return path.join(cwd, manifestPath ?? DEFAULT_MANIFEST_PATH);
}

export function loadManifest(cwd: string, manifestPath?: string): Manifest {
  const resolved = resolveManifestPath(cwd, manifestPath);
  if (!exists(resolved)) {
    throw new ContextError(`Missing manifest: ${rel(cwd, resolved)}`);
  }

  const parsed = parseJsonFile<Manifest>(resolved);
  if (parsed.version !== 1) {
    throw new ContextError("Manifest version must be 1");
  }
  asString(parsed.modulesDir, "Manifest modulesDir must be a non-empty string");
  asString(parsed.scopesFile, "Manifest scopesFile must be a non-empty string");

  if (!parsed.targets || typeof parsed.targets !== "object") {
    throw new ContextError("Manifest targets must be an object");
  }

  const targets = Object.entries(parsed.targets);
  if (!targets.find(([name]) => name === "root")) {
    throw new ContextError("Manifest targets must define root");
  }

  for (const [name, outputPath] of targets) {
    asString(name, "Manifest target key must be non-empty");
    asString(outputPath, `Manifest target output must be non-empty (${name})`);
  }

  if (parsed.claudeOutput !== undefined) {
    asString(parsed.claudeOutput, "Manifest claudeOutput must be non-empty when provided");
  }

  return parsed;
}

function validateScope(scope: ScopeDefinition, index: number): ScopeDefinition {
  const id = asString(scope.id, `Scope at index ${index} missing non-empty id`);
  const out: ScopeDefinition = { ...scope, id };

  const arrayKeys = [
    "includes",
    "codexIncludes",
    "claudeIncludes",
    "codexAgents",
    "claudeMemories",
    "claudePaths"
  ] as const;

  for (const key of arrayKeys) {
    if (scope[key] !== undefined) {
      const normalized = asStringArray(
        scope[key],
        `Scope '${id}' key '${key}' must be a non-empty string array`
      );
      switch (key) {
        case "includes":
          out.includes = normalized;
          break;
        case "codexIncludes":
          out.codexIncludes = normalized;
          break;
        case "claudeIncludes":
          out.claudeIncludes = normalized;
          break;
        case "codexAgents":
          out.codexAgents = normalized;
          break;
        case "claudeMemories":
          out.claudeMemories = normalized;
          break;
        case "claudePaths":
          out.claudePaths = normalized;
          break;
      }
    }
  }

  if (scope.codexTarget !== undefined) {
    out.codexTarget = asString(scope.codexTarget, `Scope '${id}' codexTarget must be non-empty`);
  }

  if (scope.claudeRuleFile !== undefined) {
    out.claudeRuleFile = asString(scope.claudeRuleFile, `Scope '${id}' claudeRuleFile must be non-empty`);
  }

  if (scope.parity !== undefined && typeof scope.parity !== "boolean") {
    throw new ContextError(`Scope '${id}' parity must be boolean`);
  }

  if (scope.reason !== undefined) {
    out.reason = asString(scope.reason, `Scope '${id}' reason must be non-empty when provided`);
  }

  return out;
}

export function loadScopeManifest(cwd: string, manifest: Manifest): ScopeManifest {
  const resolved = path.join(cwd, manifest.scopesFile);
  if (!exists(resolved)) {
    throw new ContextError(`Missing scope manifest: ${rel(cwd, resolved)}`);
  }

  const parsed = parseJsonFile<ScopeManifest>(resolved);
  if (parsed.version !== 1) {
    throw new ContextError("Scope manifest version must be 1");
  }
  if (!Array.isArray(parsed.scopes)) {
    throw new ContextError("Scope manifest scopes must be an array");
  }

  const ids = new Set<string>();
  const scopes = parsed.scopes.map((scope, index) => {
    const normalized = validateScope(scope, index);
    if (ids.has(normalized.id)) {
      throw new ContextError(`Duplicate scope id '${normalized.id}'`);
    }
    ids.add(normalized.id);
    return normalized;
  });

  return {
    version: 1,
    claudeRulesDir: parsed.claudeRulesDir,
    scopes
  };
}

function asTargets(value: unknown, sourcePath: string): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string")) {
    return value as string[];
  }
  throw new ContextError(`Module '${sourcePath}' must define targets as string or string[]`);
}

export function loadModules(cwd: string, manifest: Manifest): ContextModule[] {
  const modulesDir = path.join(cwd, manifest.modulesDir);
  if (!exists(modulesDir)) {
    throw new ContextError(`Missing modules directory: ${rel(cwd, modulesDir)}`);
  }

  const targetNames = new Set(Object.keys(manifest.targets));
  const files = fs.readdirSync(modulesDir)
    .filter((file) => file.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  const modules: ContextModule[] = [];
  const seenIds = new Set<string>();

  for (const file of files) {
    const filePath = path.join(modulesDir, file);
    const raw = readUtf8(filePath);
    const { meta, body } = parseFrontMatter(raw, rel(cwd, filePath));

    const id = asString(meta.id, `Module '${file}' missing non-empty id`);
    if (seenIds.has(id)) {
      throw new ContextError(`Duplicate module id '${id}'`);
    }
    seenIds.add(id);

    const targets = asTargets(meta.targets, file);
    for (const target of targets) {
      if (!targetNames.has(target)) {
        throw new ContextError(`Module '${file}' references unknown target '${target}'`);
      }
    }

    const orderValue = meta.order;
    const order = typeof orderValue === "number" ? orderValue : 1000;

    modules.push({
      id,
      targets,
      order,
      body,
      sourcePath: rel(cwd, filePath)
    });
  }

  return modules;
}

export function resolveScopeIncludes(scope: ScopeDefinition, kind: "codex" | "claude"): string[] {
  const perKind = kind === "codex" ? scope.codexIncludes : scope.claudeIncludes;
  if (perKind && perKind.length > 0) {
    return perKind;
  }
  return scope.includes ?? [];
}

export function validateScopeWiring(
  cwd: string,
  manifest: Manifest,
  scopeManifest: ScopeManifest
): { warnings: string[] } {
  const warnings: string[] = [];
  const targetNames = new Set(Object.keys(manifest.targets));
  const seenTargets = new Set<string>();
  const seenOutputs = new Set<string>();

  for (const scope of scopeManifest.scopes) {
    const allIncludes = new Set([
      ...resolveScopeIncludes(scope, "codex"),
      ...resolveScopeIncludes(scope, "claude")
    ]);

    if (allIncludes.size === 0) {
      throw new ContextError(`Scope '${scope.id}' has no includes`);
    }

    for (const includePath of allIncludes) {
      const includeAbs = path.join(cwd, includePath);
      if (!exists(includeAbs)) {
        throw new ContextError(`Scope '${scope.id}' include does not exist: ${toPosix(includePath)}`);
      }
    }

    if (scope.codexTarget) {
      if (scope.codexTarget === "root") {
        throw new ContextError(`Scope '${scope.id}' cannot map codexTarget to root`);
      }
      if (!targetNames.has(scope.codexTarget)) {
        throw new ContextError(`Scope '${scope.id}' codexTarget '${scope.codexTarget}' not in manifest targets`);
      }
      if (seenTargets.has(scope.codexTarget)) {
        throw new ContextError(`Duplicate codexTarget mapping for '${scope.codexTarget}'`);
      }
      seenTargets.add(scope.codexTarget);
    }

    for (const codexPath of scope.codexAgents ?? []) {
      const norm = toPosix(codexPath);
      if (seenOutputs.has(norm)) {
        throw new ContextError(`Duplicate generated output path '${norm}'`);
      }
      seenOutputs.add(norm);
    }

    for (const claudePath of scope.claudeMemories ?? []) {
      const norm = toPosix(claudePath);
      if (seenOutputs.has(norm)) {
        throw new ContextError(`Duplicate generated output path '${norm}'`);
      }
      seenOutputs.add(norm);
      if (!norm.endsWith("/CLAUDE.md") && norm !== "CLAUDE.md") {
        throw new ContextError(`Scope '${scope.id}' claudeMemories must point to CLAUDE.md files`);
      }
    }

    if (scope.claudeRuleFile) {
      if (!scopeManifest.claudeRulesDir) {
        throw new ContextError(`Scope '${scope.id}' defines claudeRuleFile but scope manifest has no claudeRulesDir`);
      }
      if (!scope.claudePaths || scope.claudePaths.length === 0) {
        throw new ContextError(`Scope '${scope.id}' claudeRuleFile requires claudePaths`);
      }
      const outputPath = toPosix(path.join(scopeManifest.claudeRulesDir, scope.claudeRuleFile));
      if (seenOutputs.has(outputPath)) {
        throw new ContextError(`Duplicate generated output path '${outputPath}'`);
      }
      seenOutputs.add(outputPath);
    }

    if (scope.claudeRuleFile && scope.claudeMemories && scope.claudeMemories.length > 0) {
      throw new ContextError(`Scope '${scope.id}' cannot define both claudeRuleFile and claudeMemories`);
    }

    const parityEnabled = scope.parity !== false;
    if (parityEnabled) {
      const hasClaudeScoped =
        (scope.claudeMemories && scope.claudeMemories.length > 0) ||
        Boolean(scope.claudeRuleFile);
      const hasCodexScoped = Boolean(scope.codexAgents && scope.codexAgents.length > 0);
      if (hasClaudeScoped && !hasCodexScoped) {
        throw new ContextError(
          `Scope '${scope.id}' has Claude scoped output but no codexAgents. Set parity=false with reason to bypass.`
        );
      }
      if (hasCodexScoped && !hasClaudeScoped) {
        warnings.push(
          `Scope '${scope.id}' has codexAgents without Claude scoped output. If intentional, set parity=false with reason.`
        );
      }
    }
  }

  for (const [target, outputPath] of Object.entries(manifest.targets)) {
    if (target === "root") {
      continue;
    }
    const norm = toPosix(outputPath);
    if (!seenOutputs.has(norm)) {
      throw new ContextError(`Manifest target '${target}' output '${norm}' is not generated by any scope`);
    }
  }

  return { warnings };
}
