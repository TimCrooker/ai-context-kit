export type {
  AgentKind,
  BuildOptions,
  BuildResult,
  BudgetChainEntry,
  BudgetReport,
  BudgetSummary,
  ContextModule,
  DiffItem,
  DiffReport,
  InitOptions,
  Manifest,
  ScopeDefinition,
  ScopeManifest,
  Template,
  TemplateFile,
  VerifyOptions,
  VerifyResult
} from "./types.js";

export type { ContextErrorCode } from "./errors.js";
export { ContextError, formatContextError, isContextError } from "./errors.js";
export { loadManifest, loadModules, loadScopeManifest, resolveScopeIncludes } from "./config.js";
export { buildAll, diffGenerated, doctor, initProject, lintConfig, verifyAll } from "./engine.js";
export { computeDocChainBudget } from "./budget.js";
export { lintContent } from "./content-lint.js";
export type { ContentLintResult } from "./content-lint.js";
