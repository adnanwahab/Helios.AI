#!/usr/bin/env bash
# Run from any directory. Uses a saved fly.toml from the existing app.
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
if [[ ! -f Dockerfile || ! -f .dockerignore || ! -f package.json ]]; then
  echo "Not at the HeliosAI deployment root; refusing to deploy." >&2
  exit 1
fi
if [[ ! -f fly.toml ]]; then
  echo "Missing fly.toml: first run 'fly config save -a helios-ai-laws' from this repository root." >&2
  exit 1
fi
if grep -Eq '^[[:space:]]*image[[:space:]]*=' fly.toml; then
  echo 'fly.toml pins a build image. Remove only the stale [build] image setting to use the Dockerfile.' >&2
  exit 1
fi

node scripts/pin-fly-memory.mjs fly.toml
fly deploy . -a helios-ai-laws --config fly.toml --dockerfile Dockerfile
fly status -a helios-ai-laws
fly checks list -a helios-ai-laws
curl --fail --silent --show-error --max-time 30 https://helios-ai-laws.fly.dev/api/health
printf '\n'
