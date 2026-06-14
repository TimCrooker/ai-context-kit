import { ContextError } from "../errors.js";
import type { McpClientId, McpServer } from "../types.js";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";

/** Key embedded in generated JSON configs so humans/tools recognize a managed file. */
export const MANAGED_JSON_KEY = "_generated";
export const MANAGED_MARKER = "ai-context: do not edit; generated from .ai/mcp.json";

export interface McpAdapter {
  clientId: McpClientId;
  /** Repo-relative path for the project-scope config this client reads. */
  projectOutputPath(): string;
  /** Render the given project-scope servers into the full file content. */
  render(servers: McpServer[]): string;
}

const REGISTRY: Record<McpClientId, McpAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
};

export function getAdapter(client: McpClientId): McpAdapter {
  const adapter = REGISTRY[client];
  if (!adapter) {
    throw new ContextError("AICTX_MCP_ADAPTER_UNKNOWN", `No MCP adapter for client '${client}'`);
  }
  return adapter;
}

export function allClients(): McpClientId[] {
  return Object.keys(REGISTRY) as McpClientId[];
}
