import { Command } from "commander";
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
  migrate.command("apply").description("Apply the migration plan").action(() => {
    console.log("(migrate apply - implemented in Task 15)");
  });
  migrate.command("clean").description("Remove the applied migration plan").action(() => {
    console.log("(migrate clean - implemented in Task 16)");
  });
}
