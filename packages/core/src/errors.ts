export type ContextErrorCode =
  | "AICTX_CONFIG_INVALID"
  | "AICTX_CONFIG_MISSING"
  | "AICTX_FRONT_MATTER_INVALID"
  | "AICTX_GENERATION_INVALID"
  | "AICTX_INIT_FAILED"
  | "AICTX_INTERNAL"
  | "AICTX_SKILL_FRONTMATTER_INVALID"
  | "AICTX_SKILL_NAME_INVALID"
  | "AICTX_SKILL_MISSING_FILE"
  | "AICTX_SKILL_SCOPE_UNKNOWN"
  | "AICTX_SKILL_AGENT_UNKNOWN"
  | "AICTX_SKILL_MIRROR_CONFLICT"
  | "AICTX_SKILL_MIRROR_BROKEN"
  | "AICTX_MIGRATE_PLAN_EXISTS"
  | "AICTX_MIGRATE_PLAN_NOT_FOUND"
  | "AICTX_MIGRATE_PLAN_INVALID"
  | "AICTX_MIGRATE_NO_SKILLS_BLOCK"
  | "AICTX_MIGRATE_DIRTY_TREE"
  | "AICTX_MIGRATE_NOT_GIT_REPO"
  | "AICTX_MIGRATE_ENTRY_FAILED"
  | "AICTX_MIGRATE_ALREADY_APPLIED"
  | "AICTX_MCP_REGISTRY_INVALID"
  | "AICTX_MCP_NAME_INVALID"
  | "AICTX_MCP_NAME_DUPLICATE"
  | "AICTX_MCP_SCOPE_INVALID"
  | "AICTX_MCP_TARGET_UNKNOWN"
  | "AICTX_MCP_TRANSPORT_INVALID"
  | "AICTX_MCP_ENV_INVALID"
  | "AICTX_MCP_SECRET_LITERAL"
  | "AICTX_MCP_ADAPTER_UNKNOWN"
  | "AICTX_MCP_SKILL_MISSING"
  | "AICTX_MCP_SECRET_LEAK";

const DEFAULT_CODE: ContextErrorCode = "AICTX_INTERNAL";

export class ContextError extends Error {
  readonly code: ContextErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(message: string);
  constructor(
    code: ContextErrorCode,
    message: string,
    details?: Record<string, unknown>,
  );
  constructor(
    codeOrMessage: string,
    message?: string,
    details?: Record<string, unknown>,
  ) {
    if (message === undefined) {
      super(codeOrMessage);
      this.code = DEFAULT_CODE;
    } else {
      super(message);
      this.code = codeOrMessage as ContextErrorCode;
      this.details = details;
    }
    this.name = "ContextError";
  }
}

export function isContextError(value: unknown): value is ContextError {
  return value instanceof ContextError;
}

export function formatContextError(value: unknown): string {
  if (value instanceof ContextError) {
    return `[${value.code}] ${value.message}`;
  }
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}
