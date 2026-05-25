import { Command } from "commander";

export function registerSkillsCommand(program: Command): void {
  const skills = program.command("skills").description("Manage repo skills");

  skills.command("list").description("List discovered skills with mirror status").action(() => {
    console.log("(skills list — not yet implemented; arrives in Task 15)");
  });

  skills
    .command("create <name>")
    .description("Scaffold a new skill at .ai/skills/<name>/")
    .option("--description <text>", "Description for the new skill", "")
    .option(
      "--scope <id>",
      "Limit emission to this scope (repeatable); omit for root-only",
      (value: string, prev: string[]) => [...prev, value],
      [] as string[]
    )
    .option("--with-references", "Scaffold a references/ directory", false)
    .option("--with-scripts", "Scaffold a scripts/ directory", false)
    .action(() => {
      console.log("(skills create — not yet implemented; arrives in Task 16)");
    });
}
