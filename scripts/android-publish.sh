#!/usr/bin/env bash
set -euo pipefail
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$root_dir/scripts/android-bundle.sh"
"$root_dir/scripts/android-upload.sh"
