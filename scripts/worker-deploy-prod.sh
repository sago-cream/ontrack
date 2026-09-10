#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_PATH="${ONTRACK_WORKER_PROD_CONFIG:-$ROOT_DIR/apps/worker/wrangler.production.jsonc}"
MODE="${1:-deploy}"

if [[ "$MODE" != "deploy" && "$MODE" != "--check" && "$MODE" != "--dry-run" ]]; then
    echo "Usage: $0 [--check|--dry-run]" >&2
    exit 2
fi

if [[ ! -f "$CONFIG_PATH" ]]; then
    cat >&2 <<MESSAGE
Missing production Worker config:
  $CONFIG_PATH

Copy apps/worker/wrangler.production.example.jsonc to
apps/worker/wrangler.production.jsonc, then fill in your production route and
D1 database_id. The production config is intentionally ignored by git.
MESSAGE
    exit 1
fi

if grep -Eq 'YOUR_[A-Z0-9_]+' "$CONFIG_PATH"; then
    echo "Refusing production deployment: $CONFIG_PATH contains unresolved placeholders." >&2
    exit 1
fi

if [[ "$MODE" == "--check" ]]; then
    exit 0
fi

cd "$ROOT_DIR"
bun run build

if [[ "$MODE" == "--dry-run" ]]; then
    wrangler deploy --dry-run --config "$CONFIG_PATH"
else
    wrangler deploy --config "$CONFIG_PATH"
fi
