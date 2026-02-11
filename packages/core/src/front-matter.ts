import YAML from "yaml";
import { ContextError } from "./errors.js";

export interface FrontMatterResult {
  meta: Record<string, unknown>;
  body: string;
}

export function parseFrontMatter(raw: string, sourcePath: string): FrontMatterResult {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    throw new ContextError(`Missing front matter in ${sourcePath}`);
  }

  const frontMatterRaw = match[1];
  if (frontMatterRaw === undefined) {
    throw new ContextError(`Unable to parse front matter in ${sourcePath}`);
  }

  const meta = YAML.parse(frontMatterRaw);
  if (!meta || typeof meta !== "object") {
    throw new ContextError(`Invalid front matter object in ${sourcePath}`);
  }

  const body = raw.slice(match[0].length).trim();
  if (!body) {
    throw new ContextError(`Empty module body in ${sourcePath}`);
  }

  return { meta: meta as Record<string, unknown>, body };
}
