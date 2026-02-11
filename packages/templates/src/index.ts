interface TemplateFile {
  path: string;
  content: string;
}

interface Template {
  name: string;
  files: TemplateFile[];
}

const DEFAULT_TEMPLATE: Template = {
  name: "default",
  files: [
    {
      path: ".ai/context/schemas/manifest.schema.json",
      content: JSON.stringify(
        {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          title: "ai-context manifest",
          type: "object",
          additionalProperties: false,
          required: ["version", "modulesDir", "scopesFile", "targets"],
          properties: {
            $schema: { type: "string" },
            version: { const: 1 },
            modulesDir: { type: "string", minLength: 1 },
            scopesFile: { type: "string", minLength: 1 },
            claudeOutput: { type: "string", minLength: 1 },
            targets: {
              type: "object",
              minProperties: 1,
              required: ["root"],
              additionalProperties: {
                type: "string",
                minLength: 1
              }
            }
          }
        },
        null,
        2
      )
    },
    {
      path: ".ai/context/schemas/scopes.schema.json",
      content: JSON.stringify(
        {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          title: "ai-context scopes",
          type: "object",
          additionalProperties: false,
          required: ["version", "scopes"],
          properties: {
            $schema: { type: "string" },
            version: { const: 1 },
            claudeRulesDir: { type: "string", minLength: 1 },
            scopes: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id"],
                properties: {
                  id: { type: "string", minLength: 1 },
                  codexTarget: { type: "string", minLength: 1 },
                  includes: {
                    type: "array",
                    minItems: 1,
                    items: { type: "string", minLength: 1 }
                  },
                  codexIncludes: {
                    type: "array",
                    minItems: 1,
                    items: { type: "string", minLength: 1 }
                  },
                  claudeIncludes: {
                    type: "array",
                    minItems: 1,
                    items: { type: "string", minLength: 1 }
                  },
                  codexAgents: {
                    type: "array",
                    minItems: 1,
                    items: { type: "string", minLength: 1 }
                  },
                  claudeMemories: {
                    type: "array",
                    minItems: 1,
                    items: { type: "string", minLength: 1 }
                  },
                  claudeRuleFile: { type: "string", minLength: 1 },
                  claudePaths: {
                    type: "array",
                    minItems: 1,
                    items: { type: "string", minLength: 1 }
                  },
                  parity: { type: "boolean" },
                  reason: { type: "string", minLength: 1 }
                }
              }
            }
          }
        },
        null,
        2
      )
    },
    {
      path: ".ai/context/manifest.json",
      content: JSON.stringify(
        {
          $schema: "./schemas/manifest.schema.json",
          version: 1,
          modulesDir: ".ai/context/modules",
          scopesFile: ".ai/context/scopes.json",
          claudeOutput: "CLAUDE.md",
          targets: {
            root: "AGENTS.md",
            api: "apps/api/AGENTS.md",
            web: "apps/web/AGENTS.md"
          }
        },
        null,
        2
      )
    },
    {
      path: ".ai/context/scopes.json",
      content: JSON.stringify(
        {
          $schema: "./schemas/scopes.schema.json",
          version: 1,
          claudeRulesDir: ".claude/rules",
          scopes: [
            {
              id: "api",
              codexTarget: "api",
              codexIncludes: [
                ".ai/rules/backend-core.md",
                ".ai/rules/security-core.md"
              ],
              claudeIncludes: [
                ".ai/rules/backend-core.md",
                ".ai/rules/security-core.md"
              ],
              codexAgents: ["apps/api/AGENTS.md"],
              claudeMemories: ["apps/api/CLAUDE.md"]
            },
            {
              id: "web",
              codexTarget: "web",
              codexIncludes: [
                ".ai/rules/frontend-core.md",
                ".ai/rules/ui-core.md"
              ],
              claudeIncludes: [
                ".ai/rules/frontend-core.md",
                ".ai/rules/ui-core.md"
              ],
              codexAgents: ["apps/web/AGENTS.md"],
              claudeMemories: ["apps/web/CLAUDE.md"]
            }
          ]
        },
        null,
        2
      )
    },
    {
      path: ".ai/context/modules/010-context-system.md",
      content: [
        "---",
        "id: context-system",
        "targets:",
        "  - root",
        "order: 10",
        "---",
        "# AI Context (Canonical)",
        "",
        "This file is generated from modular context under `.ai/context/modules`."
      ].join("\n")
    },
    {
      path: ".ai/context/modules/020-product-context.md",
      content: [
        "---",
        "id: product-context",
        "targets:",
        "  - root",
        "order: 20",
        "---",
        "## Product Context",
        "",
        "Describe your product and boundaries for all agents here."
      ].join("\n")
    },
    {
      path: ".ai/rules/backend-core.md",
      content: ["# Backend Core Rules", "", "Keep controllers thin and services cohesive."].join("\n")
    },
    {
      path: ".ai/rules/frontend-core.md",
      content: [
        "# Frontend Core Rules",
        "",
        "Use shared API clients, avoid ad-hoc fetch patterns."
      ].join("\n")
    },
    {
      path: ".ai/rules/security-core.md",
      content: [
        "# Security Core Rules",
        "",
        "Treat tenant context as server-derived, never user-owned."
      ].join("\n")
    },
    {
      path: ".ai/rules/ui-core.md",
      content: [
        "# UI Core Rules",
        "",
        "Prefer shared UI primitives and content-first design constraints."
      ].join("\n")
    },
    {
      path: ".codex/config.toml",
      content: [
        "project_root_markers = [\".git\"]",
        "project_doc_max_bytes = 65536",
        "",
        "[features]",
        "child_agents_md = true"
      ].join("\n")
    },
    {
      path: ".gitignore",
      content: ["node_modules", "dist", ".DS_Store", "CLAUDE.local.md", ".ai/secrets.local.env"].join("\n")
    }
  ]
};

const templates: Record<string, Template> = {
  default: DEFAULT_TEMPLATE
};

export function listTemplates(): string[] {
  return Object.keys(templates).sort((a, b) => a.localeCompare(b));
}

export function getTemplate(name = "default"): Template {
  const template = templates[name];
  if (!template) {
    throw new Error(`Unknown template '${name}'. Available templates: ${listTemplates().join(", ")}`);
  }
  return template;
}
