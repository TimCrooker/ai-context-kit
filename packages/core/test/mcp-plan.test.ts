import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planMcpOutputs, resolveSkillLink, renderMcpCatalog } from "../src/mcp.js";
import type { McpRegistry, McpServer } from "../src/types.js";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-mcp-plan-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("planMcpOutputs", () => {
  it("emits one project-scope output per active client, excluding user-scope servers", () => {
    const reg: McpRegistry = {
      version: 1,
      servers: [
        {
          name: "posthog",
          transport: { type: "http", url: "https://mcp.posthog.com/mcp" },
          scope: "project",
          targets: ["claude", "codex"],
        },
        {
          name: "ahrefs",
          transport: { type: "http", url: "https://api.ahrefs.com/mcp/mcp" },
          scope: "user",
          targets: ["claude"],
        },
      ],
    };
    const outputs = planMcpOutputs(tmp, reg, ["claude", "codex"]);
    const claude = outputs.find((o) => o.path === ".mcp.json")!;
    expect(JSON.parse(claude.content).mcpServers.posthog).toBeTruthy();
    expect(JSON.parse(claude.content).mcpServers.ahrefs).toBeUndefined();
    expect(claude.source).toBe("mcp:claude");
    expect(outputs.find((o) => o.path === ".codex/config.toml")).toBeTruthy();
  });

  it("only includes servers that target the client", () => {
    const reg: McpRegistry = {
      version: 1,
      servers: [
        { name: "claudeonly", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"] },
      ],
    };
    const outputs = planMcpOutputs(tmp, reg, ["claude", "codex"]);
    const codex = outputs.find((o) => o.path === ".codex/config.toml")!;
    expect(codex.content).not.toContain("claudeonly");
  });

  it("redirects codex output when a foreign .codex/config.toml already exists", () => {
    fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".codex/config.toml"), "project_doc_max_bytes = 20000\n");
    const reg: McpRegistry = {
      version: 1,
      servers: [
        { name: "grafana", transport: { type: "stdio", command: "uvx", args: ["mcp-grafana"] }, scope: "project", targets: ["codex"] },
      ],
    };
    const outputs = planMcpOutputs(tmp, reg, ["codex"]);
    expect(outputs.find((o) => o.path === ".codex/mcp.toml")).toBeTruthy();
    expect(outputs.find((o) => o.path === ".codex/config.toml")).toBeUndefined();
  });

  it("writes to .codex/config.toml when the existing file is already kit-managed", () => {
    fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".codex/config.toml"), "# ai-context: do not edit; generated from .ai/mcp.json\n");
    const reg: McpRegistry = {
      version: 1,
      servers: [
        { name: "grafana", transport: { type: "stdio", command: "uvx" }, scope: "project", targets: ["codex"] },
      ],
    };
    const outputs = planMcpOutputs(tmp, reg, ["codex"]);
    expect(outputs.find((o) => o.path === ".codex/config.toml")).toBeTruthy();
  });
});

describe("resolveSkillLink", () => {
  it("auto-links a co-named skill", () => {
    const s = { name: "ahrefs", transport: { type: "http", url: "u" }, scope: "user", targets: ["claude"] } as McpServer;
    expect(resolveSkillLink(s, (n) => n === "ahrefs")).toBe("ahrefs");
  });

  it("returns undefined when no co-named skill exists", () => {
    const s = { name: "ahrefs", transport: { type: "http", url: "u" }, scope: "user", targets: ["claude"] } as McpServer;
    expect(resolveSkillLink(s, () => false)).toBeUndefined();
  });

  it("uses an explicit skill ref", () => {
    const s = { name: "posthog", skill: "analytics-ops", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"] } as McpServer;
    expect(resolveSkillLink(s, (n) => n === "analytics-ops")).toBe("analytics-ops");
  });

  it("throws when an explicit skill ref does not exist", () => {
    const s = { name: "x", skill: "missing-skill", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"] } as McpServer;
    expect(() => resolveSkillLink(s, () => false)).toThrow(/missing skill/);
  });
});

describe("renderMcpCatalog", () => {
  it("renders a catalog block for context:true servers, with skill pointers", () => {
    const servers: McpServer[] = [
      { name: "ahrefs", transport: { type: "http", url: "u" }, scope: "user", targets: ["claude"], context: true },
      { name: "posthog", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"], context: true, skill: "analytics-ops" },
      { name: "hidden", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"] },
    ];
    const block = renderMcpCatalog(servers, (n) => n === "ahrefs" || n === "analytics-ops");
    expect(block).toContain("Available MCP servers");
    expect(block).toContain("**ahrefs**");
    expect(block).toContain("user-scoped");
    expect(block).toContain("`analytics-ops` skill");
    expect(block).not.toContain("hidden"); // context not set
  });

  it("returns an empty string when no servers opt into context", () => {
    const servers: McpServer[] = [
      { name: "x", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"] },
    ];
    expect(renderMcpCatalog(servers, () => false)).toBe("");
  });
});
