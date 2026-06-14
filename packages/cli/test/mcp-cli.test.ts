import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliBin = path.resolve(__dirname, "../dist/index.js");

describe("ai-context mcp", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aickit-cli-mcp-"));
    fs.mkdirSync(path.join(tmp, ".ai/context/modules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".ai/context/modules/010-overview.md"),
      "---\nid: overview\ntargets: [root]\norder: 10\n---\n\n# Overview\n"
    );
    fs.writeFileSync(path.join(tmp, ".ai/context/scopes.json"), JSON.stringify({ version: 1, scopes: [] }));
    fs.writeFileSync(
      path.join(tmp, ".ai/context/manifest.json"),
      JSON.stringify({
        version: 1,
        modulesDir: ".ai/context/modules",
        scopesFile: ".ai/context/scopes.json",
        targets: { root: "AGENTS.md" },
        mcp: { registry: ".ai/mcp.json", clients: ["claude", "codex"] },
      })
    );
    fs.writeFileSync(
      path.join(tmp, ".ai/mcp.json"),
      JSON.stringify({
        version: 1,
        servers: [
          { name: "posthog", transport: { type: "http", url: "https://mcp.posthog.com/mcp" }, scope: "project", targets: ["claude", "codex"] },
          { name: "ahrefs", transport: { type: "http", url: "https://api.ahrefs.com/mcp/mcp" }, scope: "user", targets: ["claude"], auth: "oauth" },
        ],
      })
    );
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("lists registered servers with scope + install hint", () => {
    const out = execSync(`node ${cliBin} mcp list`, { cwd: tmp }).toString();
    expect(out).toContain("posthog");
    expect(out).toContain("[project]");
    expect(out).toContain("ahrefs");
    expect(out).toContain("install: ai-context mcp install ahrefs --user");
  });

  it("install --user --dry-run prints the claude add command without running it", () => {
    const out = execSync(`node ${cliBin} mcp install ahrefs --user --dry-run`, { cwd: tmp }).toString();
    expect(out).toContain("claude mcp add ahrefs https://api.ahrefs.com/mcp/mcp -t http -s user");
  });

  it("list --json emits structured output", () => {
    const out = execSync(`node ${cliBin} mcp list --json`, { cwd: tmp }).toString();
    const parsed = JSON.parse(out);
    expect(parsed.servers.find((s: { name: string }) => s.name === "posthog").scope).toBe("project");
  });
});
