import { Command } from "commander";

export function registerMigrateCommand(program: Command): void {
  const migrate = program.command("migrate").description("Migrate a legacy skill layout to ai-context-kit");

  migrate.command("plan").description("Generate a migration plan").action(() => {
    console.log("(migrate plan - implemented in Task 13)");
  });
  migrate.command("status").description("Show migration plan status").action(() => {
    console.log("(migrate status - implemented in Task 14)");
  });
  migrate.command("apply").description("Apply the migration plan").action(() => {
    console.log("(migrate apply - implemented in Task 15)");
  });
  migrate.command("clean").description("Remove the applied migration plan").action(() => {
    console.log("(migrate clean - implemented in Task 16)");
  });
}
