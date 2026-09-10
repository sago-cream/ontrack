#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_PATH="$(mktemp)"
trap 'rm -f "$CONFIG_PATH"' EXIT

git -C "$ROOT_DIR" check-ignore -q apps/worker/wrangler.production.jsonc
grep -Fxq 'apps/worker/wrangler.production.jsonc' "$ROOT_DIR/.dockerignore"

cp "$ROOT_DIR/apps/worker/wrangler.production.example.jsonc" "$CONFIG_PATH"

if ONTRACK_WORKER_PROD_CONFIG="$CONFIG_PATH" bash "$ROOT_DIR/scripts/worker-deploy-prod.sh" --check 2>/dev/null; then
    echo "Expected the production template to fail validation" >&2
    exit 1
fi

sed -i.bak \
    -e 's/YOUR_CLOUDFLARE_ACCOUNT_ID/00000000000000000000000000000000/' \
    -e 's/YOUR_WEB_ORIGIN/app.invalid/' \
    -e 's/YOUR_WORKER_DOMAIN/api.invalid/' \
    -e 's/YOUR_D1_DATABASE_ID/00000000-0000-0000-0000-000000000001/' \
    "$CONFIG_PATH"
rm -f "$CONFIG_PATH.bak"

ONTRACK_WORKER_PROD_CONFIG="$CONFIG_PATH" bash "$ROOT_DIR/scripts/worker-deploy-prod.sh" --check
