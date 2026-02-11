import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeDocChainBudget } from "../src/budget.js";
import { ContextError, formatContextError, isContextError } from "../src/errors.js";
import { ensureDirForFile, exists, readUtf8, removeFile, walkFiles, writeUtf8 } from "../src/io.js";
import { ensureDotRelative, normalizePosix, rel, toPosix } from "../src/path-utils.js";
import { copyFixture } from "./helpers.js";

describe("error helpers", () => {
  it("supports default and explicit codes", () => {
    const generic = new ContextError("hello");
    expect(generic.code).toBe("AICTX_INTERNAL");

    const coded = new ContextError("AICTX_CONFIG_INVALID", "bad config", { key: "version" });
    expect(coded.code).toBe("AICTX_CONFIG_INVALID");
    expect(coded.details?.key).toBe("version");
    expect(isContextError(coded)).toBe(true);
    expect(formatContextError(coded)).toBe("[AICTX_CONFIG_INVALID] bad config");
  });
});

describe("path utils", () => {
  it("normalizes and relativizes paths", () => {
    const root = "/tmp/a";
    const absolute = "/tmp/a/b/c.md";
    expect(rel(root, absolute)).toBe("b/c.md");
    expect(ensureDotRelative("a/b")).toBe("./a/b");
    expect(ensureDotRelative("./a/b")).toBe("./a/b");
    expect(normalizePosix("a//b/../c")).toBe("a/c");
    expect(toPosix(path.join("a", "b", "c"))).toBe("a/b/c");
  });
});

describe("io helpers", () => {
  it("writes, reads, removes, and walks files", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-context-io-"));
    const filePath = path.join(tmp, "nested", "file.txt");

    ensureDirForFile(filePath);
    writeUtf8(filePath, "hello");
    expect(exists(filePath)).toBe(true);
    expect(readUtf8(filePath)).toBe("hello");

    fs.mkdirSync(path.join(tmp, "skip-me"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "skip-me", "ignored.txt"), "x", "utf8");
    const walked = walkFiles(tmp, new Set(["skip-me"]));
    expect(walked.map((p) => path.basename(p))).toContain("file.txt");
    expect(walked.map((p) => path.basename(p))).not.toContain("ignored.txt");

    removeFile(filePath);
    expect(exists(filePath)).toBe(false);
  });
});

describe("budget checks", () => {
  it("returns null without codex config and no explicit max", () => {
    const cwd = copyFixture();
    fs.rmSync(path.join(cwd, ".codex"), { recursive: true, force: true });
    const report = computeDocChainBudget(cwd);
    expect(report).toBeNull();
  });

  it("detects violations with a low max byte limit", () => {
    const cwd = copyFixture();
    const report = computeDocChainBudget(cwd, { maxBytes: 16 });
    expect(report).not.toBeNull();
    expect(report?.entries.length).toBe(2);
    expect(report?.entries.some((entry) => entry.violations.length > 0)).toBe(true);
  });
});
