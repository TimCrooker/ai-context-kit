import { Command } from "commander";
import { runMigrateApply } from "./apply.js";
import { runMigrateClean } from "./clean.js";
import { runMigratePlan } from "./plan.js";
import { runMigrateStatus } from "./status.js";

export function registerMigrateCommand(program: Command): void {
  const migrate = program.command("migrate").description("Migrate a legacy skill layout to ai-context-kit");

  migrate
    .command("plan")
    .description("Generate a migration plan from the current skill layout")
    .option("--force", "overwrite an existing migration plan", false)
    .action((opts: { force: boolean }) => runMigratePlan({ force: Boolean(opts.force) }));

  migrate
    .command("status")
    .description("Show migration plan status")
    .action(() => runMigrateStatus());
  migrate
    .command("apply")
    .description("Execute the migration plan")
    .option("--dry-run", "simulate without making changes", false)
    .action((opts: { dryRun: boolean }) => runMigrateApply({ dryRun: Boolean(opts.dryRun) }));
  migrate
    .command("clean")
    .description("Remove an applied migration plan")
    .action(() => runMigrateClean());
}
