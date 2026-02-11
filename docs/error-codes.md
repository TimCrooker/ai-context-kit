# Error Codes

`ai-context-kit` uses typed `ContextError` codes for machine-readable diagnostics.

## Stable Codes

- `AICTX_CONFIG_INVALID`
  - Invalid manifest/scopes/module schema or incompatible field values.
- `AICTX_CONFIG_MISSING`
  - Missing required manifest, scopes, or modules paths.
- `AICTX_FRONT_MATTER_INVALID`
  - Invalid or missing module front matter.
- `AICTX_GENERATION_INVALID`
  - Invalid generation graph or output construction issue.
- `AICTX_INIT_FAILED`
  - Initialization failure (for example existing file without `--force`).
- `AICTX_INTERNAL`
  - Fallback code for uncategorized internal failures.

## CLI Formatting

When a `ContextError` reaches CLI handlers, it is rendered as:

```text
[<CODE>] <message>
```
