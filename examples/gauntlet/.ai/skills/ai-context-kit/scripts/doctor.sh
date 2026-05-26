#!/usr/bin/env bash
# Convenience wrapper invoking `ai-context doctor` with kit-friendly defaults.
# Bundled with the ai-context-kit meta-skill so agents have a single command they can rely on.
set -euo pipefail

if ! command -v ai-context >/dev/null 2>&1; then
  echo "ai-context CLI not on PATH. Install with: pnpm add -D @timothycrooker/ai-context-cli" >&2
  exit 1
fi

ai-context doctor
