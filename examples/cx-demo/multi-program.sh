#!/usr/bin/env bash
# CXOS multi-program demo — two specs under one cwd, then fleet board/queue.
# Offline by default (no live platform required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CWD="${CX_CWD:-$(mktemp -d /tmp/cx-multi-XXXXXX)}"

cd "$ROOT"
echo "CWD=$CWD"
echo "flags=offline"

# Doctor first (offline wiring + ontology)
pnpm cox --cwd "$CWD" cx doctor

# Two programs: one-shot golden path each (new → approve → build → status → sim → report)
pnpm cox --cwd "$CWD" cx run billing-dispute "reduce dispute handle time"
pnpm cox --cwd "$CWD" cx run churn-save "retain cancel-intent customers"

# Fleet surfaces when present in this CLI build
run_if_cx_cmd() {
  local cmd="$1"
  if pnpm cox cx help "$cmd" >/dev/null 2>&1; then
    pnpm cox --cwd "$CWD" cx "$cmd"
  else
    echo "skip: cx $cmd not available"
  fi
}

run_if_cx_cmd board
run_if_cx_cmd queue

echo "OK multi-program complete under $CWD"
