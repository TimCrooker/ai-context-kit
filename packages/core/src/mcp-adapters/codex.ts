import type { McpServer } from "../types.js";
import type { McpAdapter } from "./index.js";
import { MANAGED_MARKER } from "./index.js";

// TOML basic strings share JSON's escaping rules for our charset (URLs, ${VAR},
// command names), so JSON.stringify is a safe serializer for these values.
function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlArray(values: string[]): string {
  return "[" + values.map(tomlString).join(", ") + "]";
}

function renderServer(s: McpServer): string {
  const lines: string[] = [`[mcp_servers.${s.name}]`];
  const t = s.transport;
  if (t.type === "stdio") {
    lines.push(`command = ${tomlString(t.command)}`);
    if (t.args && t.args.length) {
      lines.push(`args = ${tomlArray(t.args)}`);
    }
  } else {
    lines.push(`url = ${tomlString(t.url)}  # remote MCP; Codex support is version-dependent`);
  }
  if (s.env && Object.keys(s.env).length) {
    lines.push(`[mcp_servers.${s.name}.env]`);
    for (const [key, value] of Object.entries(s.env)) {
      lines.push(`${key} = ${tomlString(value)}`);
    }
  }
  return lines.join("\n");
}

export const codexAdapter: McpAdapter = {
  clientId: "codex",
  projectOutputPath: () => ".codex/config.toml",
  render(servers) {
    const body = [...servers]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(renderServer)
      .join("\n\n");
    return `# ${MANAGED_MARKER}\n\n${body}\n`;
  },
};
