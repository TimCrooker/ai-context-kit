import { Command } from "commander";
import { runMcpList } from "./list.js";
import { runMcpInstall } from "./install.js";
import { runMcpSetup } from "./setup.js";

export function registerMcpCommand(program: Command): void {
  const mcp = program.command("mcp").description("Manage MCP servers (.ai/mcp.json)");

  mcp
    .command("list")
    .description("List registered MCP servers")
    .option("--json", "Emit JSON output", false)
    .action((opts: { json: boolean }) => runMcpList({ json: Boolean(opts.json) }));

  mcp
    .command("install <name>")
    .description("Install a user-scope MCP server into your client's user config")
    .option("--user", "Install into user config (required)", false)
    .option("--dry-run", "Print the command without running it", false)
    .action((name: string, opts: { user: boolean; dryRun: boolean }) =>
      runMcpInstall(name, { user: Boolean(opts.user), dryRun: Boolean(opts.dryRun) })
    );

  mcp
    .command("setup <name>")
    .description("Run a server's setup command or print its auth hint")
    .action((name: string) => runMcpSetup(name));
}
