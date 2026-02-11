import path from "node:path";
import { readUtf8 } from "./io.js";
import { ensureDotRelative, normalizePosix, rel, toPosix } from "./path-utils.js";
import { ContextError } from "./errors.js";
import type { ContextModule, Manifest, ScopeDefinition, ScopeManifest } from "./types.js";
import { resolveScopeIncludes } from "./config.js";

export interface GeneratedOutput {
  path: string;
  content: string;
  source: string;
}

const DEFAULT_CLAUDE_OUTPUT = "CLAUDE.md";

function withGeneratedHeader(source: string, body: string): string {
  const header = [
    "<!--",
    "  GENERATED FILE: Do not edit directly.",
    `  Source: ${source}`,
    "  Build: ai-context build",
    "-->",
    ""
  ].join("\n");
  return `${header}${body.trim()}\n`;
}

function tidySpacing(input: string): string {
  return input.replace(/\n{3,}/g, "\n\n").trim();
}

function rewriteInlineDocRefs(body: string, includePath: string): string {
  const includeDir = path.posix.dirname(toPosix(includePath));
  const fenceRegex = /```[\s\S]*?```/g;
  let last = 0;
  let out = "";

  function rewriteChunk(chunk: string): string {
    return chunk.replace(/`((?:\.\.?\/)[^`\n]*?\.md)`/g, (match, relativePath) => {
      const resolved = path.posix.normalize(path.posix.join(includeDir, relativePath));
      if (resolved.startsWith("../")) {
        return match;
      }
      return `\`./${resolved}\``;
    });
  }

  for (const m of body.matchAll(fenceRegex)) {
    const idx = m.index ?? 0;
    out += rewriteChunk(body.slice(last, idx));
    out += m[0];
    last = idx + m[0].length;
  }
  out += rewriteChunk(body.slice(last));

  return out;
}

function modulesBody(target: string, modules: ContextModule[]): string {
  return modules
    .filter((module) => module.targets.includes(target))
    .sort((a, b) => (a.order === b.order ? a.id.localeCompare(b.id) : a.order - b.order))
    .map((module) => module.body.trim())
    .join("\n\n")
    .trim();
}

function buildRootAgents(modules: ContextModule[]): string {
  return withGeneratedHeader(".ai/context/modules/*.md", modulesBody("root", modules));
}

function includeBlocks(cwd: string, includePaths: string[]): string[] {
  return includePaths.map((includePath) => {
    const absolute = path.join(cwd, includePath);
    const body = rewriteInlineDocRefs(readUtf8(absolute), includePath).trim();
    if (!body) {
      throw new ContextError(`Include file is empty: ${includePath}`);
    }
    return `<!-- Source: ${toPosix(includePath)} -->\n${body}`;
  });
}

function buildScopedAgents(cwd: string, scope: ScopeDefinition): string {
  const includes = resolveScopeIncludes(scope, "codex");
  const intro = [
    "# Scoped Agent Context (Generated)",
    "",
    "This file is generated from `.ai/context/scopes.json` by `ai-context build`.",
    "Edit scope definitions and re-run the build instead of editing this file directly.",
    "",
    `## Scope: ${scope.id}`
  ];

  const body = tidySpacing([intro.join("\n"), ...includeBlocks(cwd, includes)].join("\n\n"));
  return withGeneratedHeader(".ai/context/scopes.json", body);
}

function buildClaudeRoot(modules: ContextModule[]): string {
  const lines = [
    "# Claude Instructions",
    "",
    "This file is generated from `.ai/context/scopes.json` by `ai-context build`.",
    "Edit scope definitions and re-run the build instead of editing this file directly.",
    "",
    "## Shared Canonical Context (Inlined)",
    "",
    "<!-- Source: .ai/context/modules/*.md -->",
    modulesBody("root", modules),
    "",
    "## Claude-Specific Notes",
    "",
    "- Use scoped `CLAUDE.md` files for domain-specific, just-in-time context.",
    "- Reserve `.claude/rules/*.md` for narrow path-glob injections only.",
    "- Keep local secrets in `.ai/secrets.local.env` (gitignored)."
  ];

  return withGeneratedHeader(".ai/context/scopes.json", lines.join("\n"));
}

function buildScopedClaude(cwd: string, scope: ScopeDefinition): string {
  const includes = resolveScopeIncludes(scope, "claude");
  const intro = [
    "# Scoped Claude Instructions",
    "",
    "This file is generated from `.ai/context/scopes.json` by `ai-context build`.",
    "Edit scope definitions and re-run the build instead of editing this file directly.",
    "",
    `## Scope: ${scope.id}`
  ];

  const body = tidySpacing([intro.join("\n"), ...includeBlocks(cwd, includes)].join("\n\n"));
  return withGeneratedHeader(".ai/context/scopes.json", body);
}

function buildClaudeRule(cwd: string, scope: ScopeDefinition, outputPath: string): string {
  const includes = resolveScopeIncludes(scope, "claude");
  const outDir = path.dirname(path.join(cwd, outputPath));
  const lines: string[] = [];

  lines.push("---");
  lines.push("paths:");
  for (const pattern of scope.claudePaths ?? []) {
    lines.push(`  - '${pattern}'`);
  }
  lines.push("---");
  lines.push("");

  for (const includePath of includes) {
    const includeAbs = path.join(cwd, includePath);
    const relative = normalizePosix(path.relative(outDir, includeAbs));
    lines.push(`@${ensureDotRelative(relative)}`);
  }

  return `${lines.join("\n").trim()}\n`;
}

export function collectGeneratedOutputs(
  cwd: string,
  manifest: Manifest,
  scopeManifest: ScopeManifest,
  modules: ContextModule[]
): GeneratedOutput[] {
  const out: GeneratedOutput[] = [];
  const seen = new Set<string>();

  function add(outputPath: string, content: string, source: string): void {
    const norm = toPosix(outputPath);
    if (seen.has(norm)) {
      throw new ContextError(`Duplicate output path '${norm}' from ${source}`);
    }
    seen.add(norm);
    out.push({ path: norm, content, source });
  }

  const rootOutput = manifest.targets.root;
  if (!rootOutput) {
    throw new ContextError("Manifest targets must define root output path");
  }
  add(rootOutput, buildRootAgents(modules), "target:root");

  const claudeOutput = manifest.claudeOutput ?? DEFAULT_CLAUDE_OUTPUT;
  add(claudeOutput, buildClaudeRoot(modules), "claude:root");

  for (const scope of scopeManifest.scopes) {
    if (scope.codexAgents && scope.codexAgents.length > 0) {
      const generated = buildScopedAgents(cwd, scope);
      for (const outputPath of scope.codexAgents) {
        add(outputPath, generated, `scope:${scope.id}:codex`);
      }
    }
  }

  for (const scope of scopeManifest.scopes) {
    if (scope.claudeMemories && scope.claudeMemories.length > 0) {
      for (const outputPath of scope.claudeMemories) {
        add(outputPath, buildScopedClaude(cwd, scope), `scope:${scope.id}:claude-memory`);
      }
    }

    if (scope.claudeRuleFile) {
      const rulesDir = scopeManifest.claudeRulesDir;
      if (!rulesDir) {
        throw new ContextError(`Scope '${scope.id}' requested claudeRuleFile but claudeRulesDir is not defined`);
      }
      const outputPath = rel(cwd, path.join(cwd, rulesDir, scope.claudeRuleFile));
      add(outputPath, buildClaudeRule(cwd, scope, outputPath), `scope:${scope.id}:claude-rule`);
    }
  }

  for (const [target, outputPath] of Object.entries(manifest.targets)) {
    if (target === "root") {
      continue;
    }
    const norm = toPosix(outputPath);
    if (!seen.has(norm)) {
      throw new ContextError(`Manifest target '${target}' output '${norm}' is not generated by scopes`);
    }
  }

  return out;
}
