#!/usr/bin/env bash
# CXOS golden path — offline or --live
# Prefer one-shot `cox cx run`; stepwise commands remain available.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CWD="${CX_CWD:-$(mktemp -d /tmp/cx-golden-XXXXXX)}"
LIVE_ARGS=()
if [[ "${1:-}" == "--live" ]]; then
  LIVE_ARGS=(--live --base-url "${CX_LOCAL_BASE_URL:-http://127.0.0.1:3143}")
fi

cd "$ROOT"
echo "CWD=$CWD"
if [[ ${#LIVE_ARGS[@]} -gt 0 ]]; then
  echo "flags=${LIVE_ARGS[*]}"
else
  echo "flags=offline"
fi

# Doctor first (exit 1 under --live if stack not ready)
pnpm cox --cwd "$CWD" cx doctor "${LIVE_ARGS[@]+"${LIVE_ARGS[@]}"}"

# One-shot golden path: new (if needed) → approve → build → status → simulate → report
pnpm cox --cwd "$CWD" cx run golden "golden path dispute" "${LIVE_ARGS[@]+"${LIVE_ARGS[@]}"}"

# Explicit operate surface after run
pnpm cox --cwd "$CWD" cx console golden "${LIVE_ARGS[@]+"${LIVE_ARGS[@]}"}"
pnpm cox --cwd "$CWD" cx proposals golden
pnpm cox --cwd "$CWD" cx export-aws golden "${CWD}/cx-export/golden-aws"
pnpm cox --cwd "$CWD" cx nba journey=churn_prevention stage=cancel_requested confidence=0.9

# Fleet surfaces (offline workspace reads)
pnpm cox --cwd "$CWD" cx board
pnpm cox --cwd "$CWD" cx dashboard "$CWD/cxos-dashboard.html"
pnpm cox --cwd "$CWD" cx queue

# Stepwise equivalent (commented for reference):
# pnpm cox --cwd "$CWD" cx new golden "golden path dispute"
# pnpm cox --cwd "$CWD" cx approve golden requirements
# pnpm cox --cwd "$CWD" cx build golden --target all $LIVE_ARGS
# pnpm cox --cwd "$CWD" cx status golden $LIVE_ARGS
# pnpm cox --cwd "$CWD" cx simulate golden --target local $LIVE_ARGS
# pnpm cox --cwd "$CWD" cx report golden

echo "OK golden path complete under $CWD"
