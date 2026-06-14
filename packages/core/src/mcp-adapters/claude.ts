import type { McpServer } from "../types.js";
import type { McpAdapter } from "./index.js";
import { MANAGED_JSON_KEY, MANAGED_MARKER } from "./index.js";

function entry(s: McpServer): Record<string, unknown> {
  const t = s.transport;
  const base =
    t.type === "stdio"
      ? { command: t.command, ...(t.args && t.args.length ? { args: t.args } : {}) }
      : { type: t.type, url: t.url };
  return s.env && Object.keys(s.env).length ? { ...base, env: s.env } : base;
}

export const claudeAdapter: McpAdapter = {
  clientId: "claude",
  projectOutputPath: () => ".mcp.json",
  render(servers) {
    const mcpServers: Record<string, unknown> = {};
    for (const s of [...servers].sort((a, b) => a.name.localeCompare(b.name))) {
      mcpServers[s.name] = entry(s);
    }
    return JSON.stringify({ [MANAGED_JSON_KEY]: MANAGED_MARKER, mcpServers }, null, 2) + "\n";
  },
};
