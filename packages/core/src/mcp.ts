import fs from "node:fs";
import path from "node:path";
import { ContextError } from "./errors.js";
import type { McpRegistry, McpServer, McpClientId, Manifest } from "./types.js";

const NAME_PATTERN = /^[a-z0-9](?:-?[a-z0-9]+)*$/;
const KNOWN_CLIENTS: McpClientId[] = ["claude", "codex"];

// An ${VAR} reference is the only allowed dynamic value. A bare value that looks
// like a credential (long token / known key prefix / PEM header) is rejected so
// secrets never get committed into a registry that fans out to tracked files.
const ENV_REF = /^\$\{[A-Z0-9_]+\}$/;
const SECRET_LITERAL = /(sk-|xox[baprs]-|ghp_|AKIA|-----BEGIN|[A-Za-z0-9_-]{32,})/;

export function parseMcpRegistry(raw: string, sourcePath: string): McpRegistry {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new ContextError(
      "AICTX_MCP_REGISTRY_INVALID",
      `Invalid JSON in ${sourcePath}: ${String(e)}`
    );
  }

  const reg = json as McpRegistry;
  if (reg?.version !== 1 || !Array.isArray(reg.servers)) {
    throw new ContextError(
      "AICTX_MCP_REGISTRY_INVALID",
      `${sourcePath} must have version:1 and a servers[] array`
    );
  }

  const seen = new Set<string>();
  for (const server of reg.servers) {
    validateServer(server, sourcePath, seen);
  }
  return reg;
}

function validateServer(s: McpServer, src: string, seen: Set<string>): void {
  if (!s.name || typeof s.name !== "string" || !NAME_PATTERN.test(s.name)) {
    throw new ContextError(
      "AICTX_MCP_NAME_INVALID",
      `Invalid MCP server name '${s.name}' in ${src} (must be [a-z0-9-], no leading/trailing/consecutive hyphens)`
    );
  }
  if (seen.has(s.name)) {
    throw new ContextError(
      "AICTX_MCP_NAME_DUPLICATE",
      `Duplicate MCP server '${s.name}' in ${src}`
    );
  }
  seen.add(s.name);

  if (s.scope !== "project" && s.scope !== "user") {
    throw new ContextError(
      "AICTX_MCP_SCOPE_INVALID",
      `MCP server '${s.name}' scope must be 'project' or 'user' (${src})`
    );
  }

  if (!Array.isArray(s.targets) || s.targets.length === 0) {
    throw new ContextError(
      "AICTX_MCP_TARGET_UNKNOWN",
      `MCP server '${s.name}' must list at least one target client (${src})`
    );
  }
  for (const t of s.targets) {
    if (!KNOWN_CLIENTS.includes(t)) {
      throw new ContextError(
        "AICTX_MCP_TARGET_UNKNOWN",
        `MCP server '${s.name}' has unknown target '${t}' in ${src} (known: ${KNOWN_CLIENTS.join(", ")})`
      );
    }
  }

  const t = s.transport;
  const validHttp =
    !!t && (t.type === "http" || t.type === "sse") && typeof (t as { url?: unknown }).url === "string";
  const validStdio =
    !!t && t.type === "stdio" && typeof (t as { command?: unknown }).command === "string";
  if (!validHttp && !validStdio) {
    throw new ContextError(
      "AICTX_MCP_TRANSPORT_INVALID",
      `MCP server '${s.name}' has an invalid transport in ${src} (need http/sse{url} or stdio{command})`
    );
  }

  for (const [key, value] of Object.entries(s.env ?? {})) {
    if (typeof value !== "string") {
      throw new ContextError(
        "AICTX_MCP_ENV_INVALID",
        `MCP server '${s.name}' env '${key}' must be a string in ${src}`
      );
    }
    if (!ENV_REF.test(value) && SECRET_LITERAL.test(value)) {
      throw new ContextError(
        "AICTX_MCP_SECRET_LITERAL",
        `MCP server '${s.name}' env '${key}' looks like a literal secret; use a \${VAR} reference instead (${src})`
      );
    }
  }
}

export function loadMcpRegistry(cwd: string, manifest: Manifest): McpRegistry | null {
  if (!manifest.mcp) return null;
  const abs = path.isAbsolute(manifest.mcp.registry)
    ? manifest.mcp.registry
    : path.join(cwd, manifest.mcp.registry);
  if (!fs.existsSync(abs)) {
    return { version: 1, servers: [] };
  }
  return parseMcpRegistry(fs.readFileSync(abs, "utf8"), manifest.mcp.registry);
}
