import process from "node:process";
import { applyPlan, formatContextError } from "@timothycrooker/ai-context-core";

interface ApplyOptions {
  dryRun?: boolean;
}

export function runMigrateApply(opts: ApplyOptions): void {
  try {
    const cwd = process.cwd();
    const report = applyPlan(cwd, { dryRun: Boolean(opts.dryRun) });

    if (opts.dryRun) {
      console.log(`Dry-run: would apply ${report.applied.length} entries.`);
    } else {
      console.log(`Applied ${report.applied.length} entries.`);
    }
    for (const a of report.applied) {
      console.log(`  ${opts.dryRun ? "would " : ""}${a.action}: ${a.name}`);
    }
    if (report.skipped.length > 0) {
      console.log(`Skipped ${report.skipped.length}:`);
      for (const s of report.skipped) console.log(`  - ${s.name}: ${s.reason}`);
    }
    if (report.failed.length > 0) {
      console.error(`Failed ${report.failed.length}:`);
      for (const f of report.failed) console.error(`  - ${f.name}: ${f.reason}`);
      process.exit(2);
    }

    if (!opts.dryRun && report.applied.length > 0) {
      console.log(`\nMigration complete. Next steps:`);
      console.log(`  ai-context build      # ensure mirrors are consistent`);
      console.log(`  ai-context verify     # confirm clean state`);
      console.log(`  ai-context doctor     # check for issues`);
    }
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
