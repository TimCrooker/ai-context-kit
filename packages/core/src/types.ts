export type AgentKind = "codex" | "claude";

export interface Manifest {
  version: 1;
  modulesDir: string;
  scopesFile: string;
  targets: Record<string, string>;
  claudeOutput?: string;
}

export interface ScopeDefinition {
  id: string;
  codexTarget?: string;
  includes?: string[];
  codexIncludes?: string[];
  claudeIncludes?: string[];
  codexAgents?: string[];
  claudeMemories?: string[];
  claudeRuleFile?: string;
  claudePaths?: string[];
  parity?: boolean;
  reason?: string;
}

export interface ScopeManifest {
  version: 1;
  claudeRulesDir?: string;
  scopes: ScopeDefinition[];
}

export interface ContextModule {
  id: string;
  targets: string[];
  order: number;
  body: string;
  sourcePath: string;
}

export interface BuildOptions {
  manifestPath?: string;
  check?: boolean;
  dryRun?: boolean;
  removeOrphans?: boolean;
}

export interface BuildResult {
  written: string[];
  unchanged: string[];
  removed: string[];
  warnings: string[];
  upToDate: boolean;
}

export interface VerifyOptions {
  manifestPath?: string;
  strictCodexConfig?: boolean;
}

export interface VerifyResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  budgetReport?: BudgetReport;
}

export interface BudgetChainEntry {
  directory: string;
  totalBytes: number;
}

export interface BudgetSummary {
  docName: "AGENTS" | "CLAUDE";
  maxBytes: number;
  worst: BudgetChainEntry;
  violations: BudgetChainEntry[];
}

export interface BudgetReport {
  entries: BudgetSummary[];
}

export interface DiffItem {
  path: string;
  type: "create" | "update" | "delete";
}

export interface DiffReport {
  items: DiffItem[];
}

export interface InitOptions {
  force?: boolean;
  includeExampleScopes?: boolean;
}

export interface TemplateFile {
  path: string;
  content: string;
}

export interface Template {
  name: string;
  files: TemplateFile[];
}
