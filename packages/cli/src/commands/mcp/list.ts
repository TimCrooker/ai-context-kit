import process from "node:process";
import {
  discoverSkills,
  formatContextError,
  loadManifest,
  loadMcpRegistry,
  resolveSkillLink,
} from "@timothycrooker/ai-context-core";

interface ListOptions {
  json?: boolean;
}

export function runMcpList(opts: ListOptions): void {
  try {
    const cwd = process.cwd();
    const manifest = loadManifest(cwd);
    const reg = loadMcpRegistry(cwd, manifest);
    if (!manifest.mcp || !reg) {
      if (opts.json) console.log(JSON.stringify({ servers: [] }, null, 2));
      else console.log("No MCP registry configured (manifest.mcp absent).");
      return;
    }

    const skillNames = new Set(
      manifest.skills ? discoverSkills(cwd, manifest.skills.source).map((s) => s.name) : []
    );

    const rows = reg.servers.map((s) => ({
      name: s.name,
      scope: s.scope,
      targets: s.targets,
      transport: s.transport.type,
      skill: resolveSkillLink(s, (n) => skillNames.has(n)) ?? null,
      auth: s.auth ?? null,
    }));

    if (opts.json) {
      console.log(JSON.stringify({ servers: rows }, null, 2));
      return;
    }

    if (rows.length === 0) {
      console.log("No MCP servers registered.");
      return;
    }

    for (const r of rows) {
      const skill = r.skill ? `skill=${r.skill}` : "no-skill";
      const hint = r.scope === "user" ? `  (install: ai-context mcp install ${r.name} --user)` : "";
      console.log(`${r.name}  [${r.scope}]  targets=${r.targets.join(",")}  ${r.transport}  ${skill}${hint}`);
    }
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
