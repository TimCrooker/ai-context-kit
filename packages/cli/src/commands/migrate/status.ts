import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { MIGRATE_PLAN_REL_PATH, formatContextError, readPlan } from "@timothycrooker/ai-context-core";

export function runMigrateStatus(): void {
  try {
    const cwd = process.cwd();
    const planPath = path.join(cwd, MIGRATE_PLAN_REL_PATH);
    if (!fs.existsSync(planPath)) {
      console.log(`No migration plan present at ${MIGRATE_PLAN_REL_PATH}`);
      console.log(`Run 'ai-context migrate plan' to generate one.`);
      return;
    }
    const plan = readPlan(cwd);
    const total = plan.summary.total_entries_found;
    const applied = plan.entries.filter((e) => e.applied_at !== null).length;

    console.log(`Migration plan: ${MIGRATE_PLAN_REL_PATH}`);
    console.log(`  Generated: ${plan.generated_at}`);
    console.log(`  Entries: ${total}`);
    console.log(`  Applied: ${applied} / ${total}`);
    if (applied === 0) {
      console.log(`  State: unapplied`);
    } else if (applied < total) {
      console.log(`  State: partially applied`);
    } else {
      console.log(`  State: applied`);
    }
    console.log(`  Actions:`);
    for (const [action, count] of Object.entries(plan.summary.actions)) {
      if (count === 0) continue;
      console.log(`    ${action}: ${count}`);
    }
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
