import process from "node:process";
import { execSync } from "node:child_process";
import {
  formatContextError,
  loadManifest,
  loadMcpRegistry,
} from "@timothycrooker/ai-context-core";

export function runMcpSetup(name: string): void {
  try {
    const cwd = process.cwd();
    const manifest = loadManifest(cwd);
    const reg = loadMcpRegistry(cwd, manifest);
    const server = reg?.servers.find((s) => s.name === name);
    if (!server) {
      console.error(`MCP server '${name}' not found in registry.`);
      process.exit(1);
      return;
    }

    if (server.setup) {
      console.log(`Running setup for '${name}': ${server.setup}`);
      execSync(server.setup, { cwd, stdio: "inherit" });
      return;
    }

    if (server.auth === "oauth") {
      console.log(`'${name}' uses OAuth — run /mcp in your client and authenticate.`);
      return;
    }

    console.log(`No setup defined for '${name}'.`);
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
