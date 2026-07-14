import process from "node:process";
import path from "node:path";
import fs from "node:fs";
import { buildAll, formatContextError } from "@timothycrooker/ai-context-core";

interface CreateOptions {
  description: string;
  scope: string[];
  agents: string[];
  withReferences: boolean;
  withScripts: boolean;
}

const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function runSkillsCreate(name: string, opts: CreateOptions): void {
  try {
    if (!SKILL_NAME_PATTERN.test(name) || name.length > 64) {
      console.error(
        `error: invalid skill name '${name}'. Use lowercase letters, digits, and hyphens only (max 64 chars, no leading/trailing/consecutive hyphens).`,
      );
      process.exit(1);
    }

    const cwd = process.cwd();
    const manifestPath = path.join(cwd, ".ai/context/manifest.json");
    if (!fs.existsSync(manifestPath)) {
      console.error(
        "error: .ai/context/manifest.json not found. Run `ai-context init` first.",
      );
      process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!manifest.skills) {
      console.error(
        "error: manifest.skills is not configured. Run `ai-context init --upgrade` to enable the skills subsystem.",
      );
      process.exit(1);
    }

    const sourceDir = path.join(cwd, manifest.skills.source, name);
    if (fs.existsSync(sourceDir)) {
      console.error(
        `error: skill source already exists at ${path.relative(cwd, sourceDir)}`,
      );
      process.exit(1);
    }

    fs.mkdirSync(sourceDir, { recursive: true });

    // Quote scope entries to handle reserved YAML chars (e.g., `*` is an anchor).
    const scopeYaml =
      opts.scope.length === 0
        ? ""
        : `scope: [${opts.scope.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(", ")}]\n`;
    const agentsYaml =
      opts.agents.length === 0
        ? ""
        : `agents: [${opts.agents.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(", ")}]\n`;
    const rawDescription =
      opts.description.length > 0 ? opts.description : `Describe ${name}`;
    // Quote description as a YAML double-quoted string so colons, newlines, brackets are safe.
    const descriptionEscaped = rawDescription
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");

    const skillMd = `---
name: ${name}
description: "${descriptionEscaped}"
${scopeYaml}${agentsYaml}---

# ${name}

Replace this section with the skill's instructions. Keep it concise — under ~500 lines. Move long reference material into \`references/\` (loaded on demand).
`;

    fs.writeFileSync(path.join(sourceDir, "SKILL.md"), skillMd, "utf8");

    if (opts.withReferences) {
      fs.mkdirSync(path.join(sourceDir, "references"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, "references/example.md"),
        `# Reference: example\n\nLong-form supporting content for ${name}. Reference this file from SKILL.md.\n`,
        "utf8",
      );
    }
    if (opts.withScripts) {
      fs.mkdirSync(path.join(sourceDir, "scripts"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, "scripts/example.sh"),
        `#!/usr/bin/env bash\nset -euo pipefail\n\necho "Skill ${name}: example script"\n`,
        "utf8",
      );
      fs.chmodSync(path.join(sourceDir, "scripts/example.sh"), 0o755);
    }

    console.log(`Created: ${path.relative(cwd, sourceDir)}`);

    const result = buildAll(cwd);
    for (const file of result.written) {
      console.log(`Created mirror: ${file}`);
    }
  } catch (error) {
    console.error(formatContextError(error));
    process.exit(1);
  }
}
