import process from "node:process";
import { formatContextError, generateMigrationPlan, writePlan } from "@timothycrooker/ai-context-core";

interface PlanOptions {
  force?: boolean;
}

export function runMigratePlan(opts: PlanOptions): void {
  try {
    const cwd = process.cwd();
    const plan = generateMigrationPlan(cwd);
    writePlan(cwd, plan, { force: Boolean(opts.force) });

    console.log(`Migration plan generated: .ai/migration-plan.json`);
    console.log(`  Total entries found: ${plan.summary.total_entries_found}`);
    for (const [action, count] of Object.entries(plan.summary.actions)) {
      if (count === 0) continue;
      console.log(`    ${action}: ${count}`);
    }
    if (plan.warnings && plan.warnings.length > 0) {
      console.log("\nWarnings:");
      for (const w of plan.warnings) console.log(`  - ${w}`);
    }
    console.log("\nNext steps:");
    console.log("  1. Review the plan: cat .ai/migration-plan.json");
    console.log("  2. (Optional) Have an agent run the ai-context-migrate skill for curation");
    console.log("  3. Apply: ai-context migrate apply");
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
