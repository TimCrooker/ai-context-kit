import process from "node:process";
import path from "node:path";
import fs from "node:fs";
import {
  discoverSkills,
  formatContextError,
  planSkillMirrors,
  type Manifest,
} from "@timothycrooker/ai-context-core";

interface ListOptions {
  json?: boolean;
}

function loadManifestForCli(cwd: string): Manifest {
  const manifestPath = path.join(cwd, ".ai/context/manifest.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
}

export function runSkillsList(opts: ListOptions): void {
  try {
    const cwd = process.cwd();
    const manifest = loadManifestForCli(cwd);
    if (!manifest.skills) {
      if (opts.json) {
        console.log(JSON.stringify({ skills: [] }, null, 2));
      } else {
        console.log("No skills configured (manifest.skills absent).");
      }
      return;
    }

    const skills = discoverSkills(cwd, manifest.skills.source);
    const plans = planSkillMirrors(cwd, manifest, skills);

    const skillRows = skills.map((s) => {
      const skillPlans = plans.filter((p) => p.source === s.dir);
      const mirrorStatus = skillPlans.map((p) => {
        const exists = fs.existsSync(p.mirror);
        if (!exists) return { path: path.relative(cwd, p.mirror), state: "missing" };
        try {
          const stat = fs.lstatSync(p.mirror);
          return {
            path: path.relative(cwd, p.mirror),
            state: stat.isSymbolicLink() ? "symlink" : "copy",
          };
        } catch {
          return { path: path.relative(cwd, p.mirror), state: "unknown" };
        }
      });
      return {
        name: s.name,
        description: s.frontmatter.description,
        scope: s.frontmatter.scope ?? [],
        source: path.relative(cwd, s.dir),
        mirrors: mirrorStatus,
      };
    });

    if (opts.json) {
      console.log(JSON.stringify({ skills: skillRows }, null, 2));
      return;
    }

    for (const skill of skillRows) {
      const scopeTag = skill.scope.length === 0 ? "[root]" : `[${skill.scope.join(",")}]`;
      console.log(`${skill.name} ${scopeTag}`);
      console.log(`  ${skill.description}`);
      console.log(`  source: ${skill.source}`);
      for (const m of skill.mirrors) {
        console.log(`  ${m.state}: ${m.path}`);
      }
      console.log("");
    }
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
