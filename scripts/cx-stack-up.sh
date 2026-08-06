#!/usr/bin/env bash
# Bring up Ollama + Nexus CX platform for healthy live CXOS.
set -euo pipefail

OLLAMA_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
PLATFORM_URL="${CX_LOCAL_BASE_URL:-http://127.0.0.1:3143}"
PLATFORM_DIR="${CX_PLATFORM_DIR:-$HOME/Projects/cx-platform/omnichannel-cx-platform}"

echo "==> Ollama"
if curl -sf -m 2 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  echo "    already up at $OLLAMA_URL"
else
  echo "    starting ollama serve..."
  nohup ollama serve >/tmp/ollama-serve.log 2>&1 &
  for _ in $(seq 1 30); do
    if curl -sf -m 1 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
      echo "    ollama ready"
      break
    fi
    sleep 0.5
  done
fi

echo "==> Models (nomic-embed-text required for ready)"
if ! ollama list 2>/dev/null | grep -q nomic-embed-text; then
  ollama pull nomic-embed-text
fi
if ! ollama list 2>/dev/null | grep -q nemotron-mini; then
  echo "    pulling optional nemotron-mini..."
  ollama pull nemotron-mini || true
fi
ollama list

echo "==> Platform ($PLATFORM_DIR)"
if curl -sf -m 2 "$PLATFORM_URL/api/journeys/definitions" >/dev/null 2>&1; then
  echo "    already up at $PLATFORM_URL"
else
  if [[ ! -d "$PLATFORM_DIR" ]]; then
    echo "    ERROR: platform dir not found: $PLATFORM_DIR"
    exit 1
  fi
  if [[ ! -d "$PLATFORM_DIR/node_modules" ]]; then
    (cd "$PLATFORM_DIR" && npm install)
  fi
  echo "    starting node server.js..."
  nohup node "$PLATFORM_DIR/server.js" >/tmp/nexus-cx.log 2>&1 &
  for _ in $(seq 1 40); do
    if curl -sf -m 1 "$PLATFORM_URL/api/journeys/definitions" >/dev/null 2>&1; then
      echo "    platform API up"
      break
    fi
    sleep 0.5
  done
fi

echo "==> Health"
READY=$(curl -s -m 3 -w "\n%{http_code}" "$PLATFORM_URL/api/health/ready" || true)
echo "$READY"
HTTP=$(echo "$READY" | tail -1)
if [[ "$HTTP" == "200" ]]; then
  echo "OK stack ready (HTTP 200)"
  exit 0
fi
echo "WARN ready returned HTTP $HTTP — check ollama models and /tmp/nexus-cx.log"
exit 1
