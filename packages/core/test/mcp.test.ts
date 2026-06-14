import { describe, it, expect } from "vitest";
import { parseMcpRegistry } from "../src/mcp.js";

describe("parseMcpRegistry", () => {
  it("parses a valid registry", () => {
    const raw = JSON.stringify({
      version: 1,
      servers: [
        {
          name: "posthog",
          transport: { type: "http", url: "https://mcp.posthog.com/mcp" },
          scope: "project",
          targets: ["claude", "codex"],
          env: { POSTHOG_PERSONAL_API_KEY: "${POSTHOG_PERSONAL_API_KEY}" },
        },
      ],
    });
    const reg = parseMcpRegistry(raw, ".ai/mcp.json");
    expect(reg.servers[0]!.name).toBe("posthog");
  });

  it("accepts a stdio transport", () => {
    const raw = JSON.stringify({
      version: 1,
      servers: [
        {
          name: "grafana",
          transport: { type: "stdio", command: "uvx", args: ["mcp-grafana"] },
          scope: "project",
          targets: ["claude"],
        },
      ],
    });
    expect(parseMcpRegistry(raw, ".ai/mcp.json").servers[0]!.transport.type).toBe("stdio");
  });

  it("rejects a literal-looking secret in env", () => {
    const raw = JSON.stringify({
      version: 1,
      servers: [
        {
          name: "x",
          transport: { type: "http", url: "https://e/x" },
          scope: "project",
          targets: ["claude"],
          env: { TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
        },
      ],
    });
    expect(() => parseMcpRegistry(raw, ".ai/mcp.json")).toThrow(/literal secret/);
  });

  it("rejects an unknown target client", () => {
    const raw = JSON.stringify({
      version: 1,
      servers: [
        {
          name: "x",
          transport: { type: "http", url: "https://e/x" },
          scope: "project",
          targets: ["notaclient"],
        },
      ],
    });
    expect(() => parseMcpRegistry(raw, ".ai/mcp.json")).toThrow(/unknown target/);
  });

  it("rejects a duplicate server name", () => {
    const raw = JSON.stringify({
      version: 1,
      servers: [
        { name: "dup", transport: { type: "http", url: "https://e/x" }, scope: "project", targets: ["claude"] },
        { name: "dup", transport: { type: "http", url: "https://e/y" }, scope: "project", targets: ["claude"] },
      ],
    });
    expect(() => parseMcpRegistry(raw, ".ai/mcp.json")).toThrow(/Duplicate MCP server/);
  });

  it("rejects an invalid transport", () => {
    const raw = JSON.stringify({
      version: 1,
      servers: [{ name: "x", transport: { type: "http" }, scope: "project", targets: ["claude"] }],
    });
    expect(() => parseMcpRegistry(raw, ".ai/mcp.json")).toThrow(/invalid transport/);
  });
});
