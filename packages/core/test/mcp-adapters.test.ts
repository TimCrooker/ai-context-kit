import { describe, it, expect } from "vitest";
import { getAdapter, allClients } from "../src/mcp-adapters/index.js";
import { claudeAdapter } from "../src/mcp-adapters/claude.js";
import { codexAdapter } from "../src/mcp-adapters/codex.js";
import type { McpServer } from "../src/types.js";

describe("adapter registry", () => {
  it("returns the claude adapter", () => {
    const a = getAdapter("claude");
    expect(a.clientId).toBe("claude");
    expect(a.projectOutputPath()).toBe(".mcp.json");
  });

  it("returns the codex adapter", () => {
    expect(getAdapter("codex").projectOutputPath()).toBe(".codex/config.toml");
  });

  it("lists all known clients", () => {
    expect(allClients().sort()).toEqual(["claude", "codex"]);
  });

  it("throws on an unknown client", () => {
    // @ts-expect-error testing runtime guard with an invalid client id
    expect(() => getAdapter("nope")).toThrow(/No MCP adapter/);
  });
});

describe("claude adapter", () => {
  it("renders .mcp.json with mcpServers, ${VAR} preserved, and a managed marker", () => {
    const servers: McpServer[] = [
      {
        name: "posthog",
        transport: { type: "http", url: "https://mcp.posthog.com/mcp" },
        scope: "project",
        targets: ["claude"],
        env: { POSTHOG_PERSONAL_API_KEY: "${POSTHOG_PERSONAL_API_KEY}" },
      },
      {
        name: "grafana",
        transport: { type: "stdio", command: "uvx", args: ["mcp-grafana"] },
        scope: "project",
        targets: ["claude"],
      },
    ];
    const out = claudeAdapter.render(servers);
    const parsed = JSON.parse(out);
    expect(parsed._generated).toContain("ai-context");
    expect(parsed.mcpServers.posthog).toEqual({
      type: "http",
      url: "https://mcp.posthog.com/mcp",
      env: { POSTHOG_PERSONAL_API_KEY: "${POSTHOG_PERSONAL_API_KEY}" },
    });
    expect(parsed.mcpServers.grafana).toEqual({ command: "uvx", args: ["mcp-grafana"] });
  });

  it("sorts servers by name for stable output", () => {
    const out = claudeAdapter.render([
      { name: "zeta", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"] },
      { name: "alpha", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"] },
    ]);
    const keys = Object.keys(JSON.parse(out).mcpServers);
    expect(keys).toEqual(["alpha", "zeta"]);
  });
});

describe("codex adapter", () => {
  it("renders codex toml mcp_servers tables with a managed marker", () => {
    const out = codexAdapter.render([
      {
        name: "grafana",
        transport: { type: "stdio", command: "uvx", args: ["mcp-grafana"] },
        scope: "project",
        targets: ["codex"],
        env: { GRAFANA_URL: "${GRAFANA_URL}" },
      },
    ]);
    expect(out).toContain("# ai-context");
    expect(out).toContain("[mcp_servers.grafana]");
    expect(out).toContain('command = "uvx"');
    expect(out).toContain('args = ["mcp-grafana"]');
    expect(out).toContain("[mcp_servers.grafana.env]");
    expect(out).toContain('GRAFANA_URL = "${GRAFANA_URL}"');
  });

  it("renders an http server with a url key", () => {
    const out = codexAdapter.render([
      { name: "posthog", transport: { type: "http", url: "https://mcp.posthog.com/mcp" }, scope: "project", targets: ["codex"] },
    ]);
    expect(out).toContain("[mcp_servers.posthog]");
    expect(out).toContain('url = "https://mcp.posthog.com/mcp"');
  });
});
