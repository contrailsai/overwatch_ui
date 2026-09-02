#!/usr/bin/env bash
# Run extract → apply → intel (pending) → cloak-probe on new reachable domains.
#
# Usage:
#   ./run_new.sh                          # new domains only
#   ./run_new.sh --retry-not-unlocked     # also re-probe prior non-unlocks
#   ./run_new.sh --skip-probe             # stop after intel
#   DB=SEBI-Data-Search ./run_new.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PIPELINE_ROOT="${PIPELINE_ROOT:-/Users/tempus/Desktop/overwatch/Data_pipeline_test}"
PY="${PIPELINE_ROOT}/.venv/bin/python"

if [[ ! -x "$PY" ]]; then
  echo "missing venv python: $PY" >&2
  exit 1
fi

cd "$SCRIPT_DIR"
exec "$PY" cli.py run-new --db "${DB:-SEBI-Data-Search}" "$@"
