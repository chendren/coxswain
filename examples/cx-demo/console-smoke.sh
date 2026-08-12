#!/usr/bin/env bash
# Offline Graph Console smoke: doctor → new → seed-operate → HTTP claim
# path: load_workspace → seed → serve → human_gate claim → emit
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CWD="${CX_CWD:-$(mktemp -d /tmp/cx-console-smoke-XXXXXX)}"
SPEC="${CX_SMOKE_SPEC:-smoke-console}"
CLEANUP="${CX_SMOKE_KEEP:-0}"

if [[ ! -d "$ROOT/packages/cli" ]]; then
  echo "error: monorepo root not found (expected packages/cli under $ROOT)" >&2
  exit 1
fi

if [[ "$CLEANUP" != "1" ]]; then
  trap 'rm -rf "$CWD"' EXIT
fi

cd "$ROOT"
echo "path: console_smoke → cwd=$CWD root=$ROOT spec=$SPEC"

echo "== doctor =="
pnpm cox --cwd "$CWD" cx doctor --mode offline 2>/dev/null \
  || pnpm cox --cwd "$CWD" cx doctor

echo "== new $SPEC =="
pnpm cox --cwd "$CWD" cx new "$SPEC" "Retail returns loyalty pickup console smoke" \
  || echo "note: program may already exist"

echo "== approve (next phases) =="
pnpm cox --cwd "$CWD" cx approve "$SPEC" requirements || true
pnpm cox --cwd "$CWD" cx approve "$SPEC" design || true

echo "== seed-operate =="
pnpm cox --cwd "$CWD" cx seed-operate "$SPEC" --force

echo "== proposals (CLI) =="
pnpm cox --cwd "$CWD" cx proposals "$SPEC"

echo "== console HTTP claim =="
node "$SCRIPT_DIR/console-smoke.mjs" "$CWD" "$SPEC"

echo "== after claim (CLI) =="
pnpm cox --cwd "$CWD" cx proposals "$SPEC" || true
pnpm cox --cwd "$CWD" cx tasks "$SPEC" || true

echo "console-smoke OK path: doctor → new → seed → serve → claim → emit"
