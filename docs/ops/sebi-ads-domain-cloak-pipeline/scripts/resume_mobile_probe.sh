#!/usr/bin/env bash
# Resume mobile cloak-probe — single Mongo connection for the whole batch.
# Usage: ./resume_mobile_probe.sh [start_index]   (0-based, default 0)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PIPELINE_ROOT="${PIPELINE_ROOT:-/Users/tempus/Desktop/overwatch/Data_pipeline_test}"
START="${1:-0}"
TARGETS="$ROOT/out/cloak_probe_targets.txt"
LOG="$ROOT/out/cloak_probe_batch.log"
echo "Batch probe from index $START at $(date)" | tee -a "$LOG"
"$PIPELINE_ROOT/.venv/bin/python" "$PIPELINE_ROOT/domain_analyzer/run_cloak_probe.py" \
  --db SEBI-Data-Search \
  --from-targets "$TARGETS" \
  --start-index "$START" \
  --out "$ROOT/out" \
  2>&1 | tee -a "$LOG"
echo "Batch complete at $(date)" | tee -a "$LOG"
