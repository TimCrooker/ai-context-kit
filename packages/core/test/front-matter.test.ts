import { describe, expect, it } from "vitest";
import { ContextError } from "../src/errors.js";
import { parseFrontMatter } from "../src/front-matter.js";

describe("front matter parser", () => {
  it("parses valid modules with CRLF newlines", () => {
    const raw = "---\r\nid: a\r\ntargets:\r\n  - root\r\n---\r\nbody\r\n";
    const parsed = parseFrontMatter(raw, "module.md");
    expect(parsed.meta.id).toBe("a");
    expect(parsed.body).toBe("body");
  });

  it("throws coded error for missing front matter", () => {
    expect(() => parseFrontMatter("hello", "bad.md")).toThrow(ContextError);
    try {
      parseFrontMatter("hello", "bad.md");
    } catch (error) {
      expect(error).toBeInstanceOf(ContextError);
      expect((error as ContextError).code).toBe("AICTX_FRONT_MATTER_INVALID");
    }
  });

  it("throws coded error for invalid YAML", () => {
    const raw = ["---", "id: [", "---", "body"].join("\n");
    try {
      parseFrontMatter(raw, "bad-yaml.md");
      throw new Error("expected parseFrontMatter to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ContextError);
      expect((error as ContextError).code).toBe("AICTX_FRONT_MATTER_INVALID");
    }
  });
});
