import process from "node:process";
import {
  buildAll,
  diffGenerated,
  doctor,
  initProject,
  lintConfig,
  verifyAll
} from "@timothycrooker/ai-context-core";
import { getTemplate, listTemplates } from "@timothycrooker/ai-context-templates";
import { Command } from "commander";

const program = new Command();

program
  .name("ai-context")
  .description("Generate and verify shared Codex + Claude context files")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize context scaffolding")
  .option("--template <name>", "template name", "default")
  .option("--force", "overwrite existing files", false)
  .action((opts: { template: string; force: boolean }) => {
    try {
      const template = getTemplate(opts.template);
      const written = initProject(process.cwd(), template, { force: Boolean(opts.force) });
      for (const file of written) {
        console.log(`created: ${file}`);
      }
      console.log(`Initialized template '${template.name}'`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Failed to initialize template");
      process.exit(1);
    }
  });

program
  .command("templates")
  .description("List available templates")
  .action(() => {
    for (const name of listTemplates()) {
      console.log(name);
    }
  });

program
  .command("build")
  .description("Generate context outputs")
  .option("--check", "fail if outputs would change", false)
  .option("--dry-run", "calculate without writing files", false)
  .option("--remove-orphans", "remove generated files no longer managed", false)
  .action((opts: { check: boolean; dryRun: boolean; removeOrphans: boolean }) => {
    try {
      const result = buildAll(process.cwd(), {
        check: Boolean(opts.check),
        dryRun: Boolean(opts.dryRun),
        removeOrphans: Boolean(opts.removeOrphans)
      });

      for (const warning of result.warnings) {
        console.warn(`warning: ${warning}`);
      }

      for (const file of result.written) {
        console.log(`${opts.check || opts.dryRun ? "would write" : "wrote"}: ${file}`);
      }
      for (const file of result.removed) {
        console.log(`${opts.check || opts.dryRun ? "would remove" : "removed"}: ${file}`);
      }

      if (!result.upToDate && opts.check) {
        console.error("Generated files are not up to date");
        process.exit(1);
      }

      console.log(
        result.upToDate ? "Context outputs are up to date" : "Context outputs generated successfully"
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Build failed");
      process.exit(1);
    }
  });

program
  .command("verify")
  .description("Verify configuration, generated outputs, and budget checks")
  .option("--strict-codex-config", "require .codex/config.toml with project_doc_max_bytes", false)
  .action((opts: { strictCodexConfig: boolean }) => {
    const result = verifyAll(process.cwd(), { strictCodexConfig: Boolean(opts.strictCodexConfig) });

    for (const warning of result.warnings) {
      console.warn(`warning: ${warning}`);
    }

    if (result.budgetReport) {
      for (const entry of result.budgetReport.entries) {
        console.log(
          `${entry.docName} budget: worst ${entry.worst.directory}=${entry.worst.totalBytes}/${entry.maxBytes}`
        );
      }
    }

    if (!result.ok) {
      for (const error of result.errors) {
        console.error(`error: ${error}`);
      }
      process.exit(1);
    }

    console.log("Context verify passed");
  });

program
  .command("diff")
  .description("Show pending generated file changes")
  .action(() => {
    try {
      const report = diffGenerated(process.cwd());
      if (report.items.length === 0) {
        console.log("No generated changes");
        return;
      }
      for (const item of report.items) {
        console.log(`${item.type}: ${item.path}`);
      }
      process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Diff failed");
      process.exit(1);
    }
  });

program
  .command("doctor")
  .description("Diagnose common configuration issues")
  .action(() => {
    const result = doctor(process.cwd());
    if (result.issues.length === 0) {
      console.log("No issues detected");
      for (const suggestion of result.suggestions) {
        console.log(`note: ${suggestion}`);
      }
      return;
    }

    for (const issue of result.issues) {
      console.error(`issue: ${issue}`);
    }
    for (const suggestion of result.suggestions) {
      console.log(`suggestion: ${suggestion}`);
    }
    process.exit(1);
  });

program
  .command("lint-config")
  .description("Validate manifest, scope wiring, and modules")
  .action(() => {
    const result = lintConfig(process.cwd());
    if (!result.ok) {
      for (const error of result.errors) {
        console.error(`error: ${error}`);
      }
      process.exit(1);
    }
    console.log("Config lint passed");
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : "Unexpected CLI failure");
  process.exit(1);
});
