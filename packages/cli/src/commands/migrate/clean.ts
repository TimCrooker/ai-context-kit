import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  ContextError,
  MIGRATE_PLAN_REL_PATH,
  formatContextError,
  readPlan,
} from "@timothycrooker/ai-context-core";

export function runMigrateClean(): void {
  try {
    const cwd = process.cwd();
    const planPath = path.join(cwd, MIGRATE_PLAN_REL_PATH);
    if (!fs.existsSync(planPath)) {
      console.log(`No plan to clean (file not present).`);
      return;
    }
    const plan = readPlan(cwd);
    if (!plan.summary.applied) {
      throw new ContextError(
        "AICTX_MIGRATE_ALREADY_APPLIED",
        `Refusing to remove an unapplied plan. Run --apply first, or delete manually.`
      );
    }
    fs.unlinkSync(planPath);
    console.log(`Removed ${MIGRATE_PLAN_REL_PATH}`);
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
