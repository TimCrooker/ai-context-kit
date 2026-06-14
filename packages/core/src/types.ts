export type AgentKind = "codex" | "claude";

export interface SkillsManifestBlock {
  source: string;
  mirrors: string[];
  metaSkill?: boolean;
}

export interface Manifest {
  version: 1;
  modulesDir: string;
  scopesFile: string;
  targets: Record<string, string>;
  claudeOutput?: string;
  skills?: SkillsManifestBlock;
  mcp?: McpManifestBlock;
}

// MCP primitive: declare servers once in .ai/mcp.json, fan out to each agent client.
export type McpClientId = "claude" | "codex"; // v1; cursor/vscode/gemini added later

export type McpTransport =
  | { type: "http" | "sse"; url: string }
  | { type: "stdio"; command: string; args?: string[] };

export interface McpServer {
  name: string;
  transport: McpTransport;
  scope: "project" | "user";
  targets: McpClientId[];
  auth?: "oauth" | "env" | "none";
  /** Values must be ${VAR} references, never literal secrets. */
  env?: Record<string, string>;
  /** Backing skill name; defaults to a co-named .ai/skills/<name> when present. */
  skill?: string;
  /** When true, emit a catalog line into the root AGENTS.md/CLAUDE.md. */
  context?: boolean;
  /** Optional shell command run by `ai-context mcp setup <name>`. */
  setup?: string;
}

export interface McpRegistry {
  version: 1;
  servers: McpServer[];
}

export interface McpManifestBlock {
  /** Path to the registry file, e.g. ".ai/mcp.json". */
  registry: string;
  /** Which client adapters are active in this repo. */
  clients: McpClientId[];
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
  upgrade?: boolean;
  refreshMetaSkill?: boolean;
}

export interface TemplateFile {
  path: string;
  content: string;
}

export interface Template {
  name: string;
  files: TemplateFile[];
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  scope?: string[];
  license?: string;
  compatibility?: string;
  metadata?: Record<string, unknown>;
  "allowed-tools"?: string | string[];
  // Allow agentskills.io-spec extension fields and Claude/Codex/Gemini-specific keys
  [extra: string]: unknown;
}

export interface SkillSource {
  name: string;
  dir: string;
  skillMdPath: string;
  frontmatter: SkillFrontmatter;
}

export interface SkillMirrorPlan {
  source: string;
  mirror: string;
  mode: "symlink" | "copy";
  reason?: string;
}

export interface SkillMirrorState {
  path: string;
  mode: "symlink" | "copy" | "missing" | "conflict";
  target?: string;
  expectedTarget?: string;
}

// Migrate subsystem types
export type MigrateActionType =
  | "move_dir"
  | "promote_bare_md"
  | "consolidate_symlink"
  | "keep_existing"
  | "REVIEW";

export type MigrateCurrentStateType =
  | "directory_with_skill_md"
  | "bare_md"
  | "existing_symlink"
  | "already_kit_managed"
  | "non_skill_file";

export interface MigrateCurrentState {
  type: MigrateCurrentStateType;
  path: string;
  files?: string[];
  current_target?: string;
  underlying_source?: string;
}

export interface MigrateTarget {
  source: string;
  mirrors: string[];
}

export interface MigrateEntry {
  name: string;
  current_state: MigrateCurrentState;
  action: MigrateActionType;
  target: MigrateTarget;
  rationale: string;
  applied_at: string | null;
}

export interface MigrateReviewCandidate {
  name: string;
  reason: string;
  paths: string[];
}

export interface MigratePlan {
  version: 1;
  generated_at: string;
  generator: {
    kit_version: string;
    cwd: string;
  };
  summary: {
    total_entries_found: number;
    actions: Record<MigrateActionType, number>;
    review_candidates: number;
    applied: boolean;
  };
  entries: MigrateEntry[];
  review_candidates: MigrateReviewCandidate[];
  warnings?: string[];
}
