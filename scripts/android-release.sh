#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$root_dir/scripts/android-check.sh"
"$root_dir/scripts/android-bundle.sh"

echo "Android release checks and signed bundle creation passed."
