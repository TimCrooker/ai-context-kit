export type ContextErrorCode =
  | "AICTX_CONFIG_INVALID"
  | "AICTX_CONFIG_MISSING"
  | "AICTX_FRONT_MATTER_INVALID"
  | "AICTX_GENERATION_INVALID"
  | "AICTX_INIT_FAILED"
  | "AICTX_INTERNAL";

const DEFAULT_CODE: ContextErrorCode = "AICTX_INTERNAL";

export class ContextError extends Error {
  readonly code: ContextErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(message: string);
  constructor(code: ContextErrorCode, message: string, details?: Record<string, unknown>);
  constructor(
    codeOrMessage: string,
    message?: string,
    details?: Record<string, unknown>
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
