#!/usr/bin/env bash
# Bulk-review pending ads whose landing domain is already reviewed.
#
# Dry-run (default):
#   ./bulk_review_reviewed_domains.sh --start 2026-09-03 --end 2026-09-05
#
# Apply:
#   ./bulk_review_reviewed_domains.sh --start 2026-09-03 --end 2026-09-05 --apply
#
# Today only:
#   ./bulk_review_reviewed_domains.sh --today --apply
#
# Single domain:
#   ./bulk_review_reviewed_domains.sh --start 2026-09-03 --end 2026-09-05 --domains ilnkarip.com --apply

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PIPELINE_ROOT="${PIPELINE_ROOT:-/Users/tempus/Desktop/overwatch/Data_pipeline_test}"
PY="${PIPELINE_ROOT}/.venv/bin/python"

if [[ ! -x "$PY" ]]; then
  echo "missing python venv: $PY" >&2
  exit 1
fi

cd "$SCRIPT_DIR"
exec "$PY" cli.py bulk-review-reviewed-domains --db SEBI-Data-Search "$@"
