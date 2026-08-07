#!/usr/bin/env bash
# CXOS golden path - offline or --live
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CWD="${CX_CWD:-$(mktemp -d /tmp/cx-golden-XXXXXX)}"
LIVE_ARGS=""
if [[ "${1:-}" == "--live" ]]; then
  LIVE_ARGS="--live --base-url ${CX_LOCAL_BASE_URL:-http://127.0.0.1:3143}"
fi

cd "$ROOT"
echo "CWD=$CWD"
echo "flags=${LIVE_ARGS:-offline}"

# shellcheck disable=SC2086
pnpm cox --cwd "$CWD" cx doctor $LIVE_ARGS

# Preferred one-shot: new (if needed) → approve → build+deploy → status → simulate → report
pnpm cox --cwd "$CWD" cx run golden "golden path dispute" $LIVE_ARGS

# Explicit stepwise alternative (kept for reference):
# pnpm cox --cwd "$CWD" cx new golden "golden path dispute"
# pnpm cox --cwd "$CWD" cx approve golden requirements
# pnpm cox --cwd "$CWD" cx build golden --target all $LIVE_ARGS
# pnpm cox --cwd "$CWD" cx status golden $LIVE_ARGS
# pnpm cox --cwd "$CWD" cx simulate golden --target local $LIVE_ARGS
# pnpm cox --cwd "$CWD" cx report golden

pnpm cox --cwd "$CWD" cx console golden $LIVE_ARGS
pnpm cox --cwd "$CWD" cx proposals golden
pnpm cox --cwd "$CWD" cx nba journey=churn_prevention stage=cancel_requested confidence=0.9

echo "OK golden path complete under $CWD"
