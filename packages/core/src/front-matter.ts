import YAML from "yaml";
import { ContextError } from "./errors.js";

export interface FrontMatterResult {
  meta: Record<string, unknown>;
  body: string;
}

export function parseFrontMatter(raw: string, sourcePath: string): FrontMatterResult {
  const normalizedRaw = raw.replace(/\r\n?/g, "\n");
  const match = normalizedRaw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    throw new ContextError(
      "AICTX_FRONT_MATTER_INVALID",
      `Missing front matter in ${sourcePath}`
    );
  }

  const frontMatterRaw = match[1];
  if (frontMatterRaw === undefined) {
    throw new ContextError(
      "AICTX_FRONT_MATTER_INVALID",
      `Unable to parse front matter in ${sourcePath}`
    );
  }

  let meta: unknown;
  try {
    meta = YAML.parse(frontMatterRaw);
  } catch (error) {
    throw new ContextError("AICTX_FRONT_MATTER_INVALID", `Invalid YAML in ${sourcePath}`, {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
  if (!meta || typeof meta !== "object") {
    throw new ContextError(
      "AICTX_FRONT_MATTER_INVALID",
      `Invalid front matter object in ${sourcePath}`
    );
  }

  const body = normalizedRaw.slice(match[0].length).trim();
  if (!body) {
    throw new ContextError("AICTX_FRONT_MATTER_INVALID", `Empty module body in ${sourcePath}`);
  }

  return { meta: meta as Record<string, unknown>, body };
}
