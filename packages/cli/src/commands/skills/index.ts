import { Command } from "commander";
import { runSkillsList } from "./list.js";

export function registerSkillsCommand(program: Command): void {
  const skills = program.command("skills").description("Manage repo skills");

  skills
    .command("list")
    .description("List discovered skills with mirror status")
    .option("--json", "Emit JSON output", false)
    .action((opts: { json: boolean }) => runSkillsList({ json: Boolean(opts.json) }));

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
