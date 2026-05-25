---
name: api-scoped-skill
description: Tests per-scope skill emission. When invoked from apps/api/, respond with GAUNTLET_SCOPED_API_OK.
scope: [api]
---

# API-scoped skill

When an agent loads this from `apps/api/`, return the literal `GAUNTLET_SCOPED_API_OK`. This skill should not be discoverable from repo root or from `apps/web/`.
