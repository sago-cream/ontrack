#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-common.sh"

android_require_command bun

cd "$ANDROID_ROOT_DIR"
NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN='' \
    NEXT_PUBLIC_ONTRACK_API_ORIGIN="$ANDROID_API_ORIGIN_VALUE" \
    NEXT_PUBLIC_ONTRACK_SHOWCASE_MODE="${ANDROID_SHOWCASE_MODE:-0}" \
    bun run --filter @ontrack/web build
ANDROID_API_ORIGIN="$ANDROID_API_ORIGIN_VALUE" python3 - <<'PY'
import json, os, subprocess
from pathlib import Path
from urllib.parse import urlsplit
origin = os.environ['ANDROID_API_ORIGIN']
url = urlsplit(origin)
if url.scheme != 'https' or not url.hostname or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment:
    raise SystemExit('ANDROID_API_ORIGIN must be an HTTPS origin without credentials, path, query, or fragment.')
Path('apps/web/out/ontrack-build.json').write_text(json.dumps({
    'apiOrigin': origin,
    'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'workingTreeDirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip()),
    'showcase': os.environ.get('ANDROID_SHOWCASE_MODE', '0') == '1',
    'billingConfigured': bool(os.environ.get('PLAY_BILLING_PUBLIC_KEY', '')),
}) + '\n')
PY
bunx cap sync android

echo "Android web assets and native dependencies are synchronized."
