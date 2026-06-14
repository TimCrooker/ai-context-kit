import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAll, verifyAll } from "../src/engine.js";

let tmp: string;

function writeManifest(extra: Record<string, unknown> = {}): void {
  fs.writeFileSync(
    path.join(tmp, ".ai/context/manifest.json"),
    JSON.stringify({
      version: 1,
      modulesDir: ".ai/context/modules",
      scopesFile: ".ai/context/scopes.json",
      targets: { root: "AGENTS.md" },
      mcp: { registry: ".ai/mcp.json", clients: ["claude", "codex"] },
      ...extra,
    })
  );
}

function writeRegistry(servers: unknown[]): void {
  fs.writeFileSync(path.join(tmp, ".ai/mcp.json"), JSON.stringify({ version: 1, servers }));
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-mcp-int-"));
  fs.mkdirSync(path.join(tmp, ".ai/context/modules"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, ".ai/context/modules/010-overview.md"),
    "---\nid: overview\ntargets: [root]\norder: 10\n---\n\n# Overview\n\nContent.\n"
  );
  fs.writeFileSync(path.join(tmp, ".ai/context/scopes.json"), JSON.stringify({ version: 1, scopes: [] }));
  writeManifest();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("build emits MCP config", () => {
  it("writes .mcp.json and .codex/config.toml from the registry", () => {
    writeRegistry([
      { name: "posthog", transport: { type: "http", url: "https://mcp.posthog.com/mcp" }, scope: "project", targets: ["claude", "codex"] },
    ]);
    buildAll(tmp);
    const claude = JSON.parse(fs.readFileSync(path.join(tmp, ".mcp.json"), "utf8"));
    expect(claude.mcpServers.posthog.url).toBe("https://mcp.posthog.com/mcp");
    expect(claude._generated).toContain("ai-context");
    expect(fs.existsSync(path.join(tmp, ".codex/config.toml"))).toBe(true);
  });

  it("injects the catalog block into AGENTS.md for context:true servers", () => {
    writeRegistry([
      { name: "posthog", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"], context: true },
    ]);
    buildAll(tmp);
    const agents = fs.readFileSync(path.join(tmp, "AGENTS.md"), "utf8");
    expect(agents).toContain("Available MCP servers");
    expect(agents).toContain("**posthog**");
  });

  it("excludes user-scope servers from committed configs", () => {
    writeRegistry([
      { name: "ahrefs", transport: { type: "http", url: "https://api.ahrefs.com/mcp/mcp" }, scope: "user", targets: ["claude"] },
    ]);
    buildAll(tmp);
    const claude = JSON.parse(fs.readFileSync(path.join(tmp, ".mcp.json"), "utf8"));
    expect(claude.mcpServers.ahrefs).toBeUndefined();
  });

  it("is idempotent — a second build reports up to date", () => {
    writeRegistry([
      { name: "posthog", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"] },
    ]);
    buildAll(tmp);
    const second = buildAll(tmp);
    expect(second.upToDate).toBe(true);
  });

  it("skips MCP entirely when manifest.mcp is absent", () => {
    writeManifest();
    // overwrite manifest without mcp
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({ version: 1, modulesDir: ".ai/context/modules", scopesFile: ".ai/context/scopes.json", targets: { root: "AGENTS.md" } })
    );
    buildAll(tmp);
    expect(fs.existsSync(path.join(tmp, ".mcp.json"))).toBe(false);
  });
});

describe("verify covers MCP staleness", () => {
  it("fails when .mcp.json is stale relative to the registry", () => {
    writeRegistry([
      { name: "posthog", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"] },
    ]);
    buildAll(tmp);
    // mutate registry without rebuilding
    writeRegistry([
      { name: "posthog", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"] },
      { name: "grafana", transport: { type: "stdio", command: "uvx", args: ["mcp-grafana"] }, scope: "project", targets: ["claude"] },
    ]);
    const res = verifyAll(tmp, {});
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/out of date/);
  });

  it("fails when a generated config contains a resolved secret literal", () => {
    writeRegistry([
      { name: "posthog", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"] },
    ]);
    buildAll(tmp);
    // Simulate a leak: hand-edit the managed file to embed a credential literal.
    fs.writeFileSync(
      path.join(tmp, ".mcp.json"),
      JSON.stringify(
        {
          _generated: "ai-context: do not edit; generated from .ai/mcp.json",
          mcpServers: { posthog: { type: "http", url: "u", env: { TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" } } },
        },
        null,
        2
      ) + "\n"
    );
    const res = verifyAll(tmp, {});
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/secret/i);
  });
});

describe("diff covers MCP outputs", () => {
  it("reports .mcp.json as create then update", async () => {
    const { diffGenerated } = await import("../src/engine.js");
    writeRegistry([
      { name: "posthog", transport: { type: "http", url: "u" }, scope: "project", targets: ["claude"] },
    ]);
    const before = diffGenerated(tmp);
    expect(before.items.some((i) => i.path === ".mcp.json" && i.type === "create")).toBe(true);
    buildAll(tmp);
    const after = diffGenerated(tmp);
    expect(after.items.some((i) => i.path === ".mcp.json")).toBe(false);
  });
});
