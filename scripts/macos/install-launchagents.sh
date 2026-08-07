#!/usr/bin/env bash
# Install macOS LaunchAgents for Ollama + Nexus CX (CXOS live local stack).
# Substitutes {{HOME}} and {{PLATFORM_DIR}} into plist templates, writes to
# ~/Library/LaunchAgents, then launchctl load.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="${HOME:?HOME is required}"
PLATFORM_DIR="${CX_PLATFORM_DIR:-$HOME_DIR/Projects/cx-platform/omnichannel-cx-platform}"
PLATFORM_DIR="${PLATFORM_DIR/#\~/$HOME_DIR}"
LAUNCH_AGENTS_DIR="$HOME_DIR/Library/LaunchAgents"
LOG_DIR="$HOME_DIR/Library/Logs/coxswain"
LABELS=(com.chendren.ollama com.chendren.nexus-cx)

usage() {
  cat <<EOF
Usage: $(basename "$0") [--platform-dir DIR]

Install LaunchAgents for ollama serve and Nexus CX (node server.js).

Options:
  --platform-dir DIR   Platform root (default: CX_PLATFORM_DIR or
                       ~/Projects/cx-platform/omnichannel-cx-platform)
  -h, --help           Show this help

Env:
  CX_PLATFORM_DIR      Same as --platform-dir if flag omitted
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform-dir)
      PLATFORM_DIR="${2:?--platform-dir requires a path}"
      PLATFORM_DIR="${PLATFORM_DIR/#\~/$HOME_DIR}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$PLATFORM_DIR" ]]; then
  echo "ERROR: platform dir not found: $PLATFORM_DIR" >&2
  echo "Set CX_PLATFORM_DIR or pass --platform-dir." >&2
  exit 1
fi

if [[ ! -f "$PLATFORM_DIR/server.js" ]]; then
  echo "ERROR: no server.js in $PLATFORM_DIR" >&2
  exit 1
fi

# Resolve ollama (Homebrew / local); template defaults to {{HOME}}/.local/bin/ollama
OLLAMA_BIN="$(command -v ollama 2>/dev/null || true)"
if [[ -z "$OLLAMA_BIN" ]]; then
  for candidate in \
    "$HOME_DIR/.local/bin/ollama" \
    /opt/homebrew/bin/ollama \
    /usr/local/bin/ollama
  do
    if [[ -x "$candidate" ]]; then
      OLLAMA_BIN="$candidate"
      break
    fi
  done
fi
if [[ -z "$OLLAMA_BIN" ]]; then
  OLLAMA_BIN="$HOME_DIR/.local/bin/ollama"
  echo "warn: ollama not found; plist will use $OLLAMA_BIN" >&2
fi

mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"

subst() {
  local src="$1"
  local dest="$2"
  sed \
    -e "s|{{HOME}}|${HOME_DIR}|g" \
    -e "s|{{PLATFORM_DIR}}|${PLATFORM_DIR}|g" \
    -e "s|${HOME_DIR}/.local/bin/ollama|${OLLAMA_BIN}|g" \
    "$src" >"$dest"
  chmod 644 "$dest"
}

echo "==> Installing LaunchAgents"
echo "    HOME=$HOME_DIR"
echo "    PLATFORM_DIR=$PLATFORM_DIR"
echo "    OLLAMA_BIN=$OLLAMA_BIN"

for label in "${LABELS[@]}"; do
  template="$SCRIPT_DIR/${label}.plist.template"
  dest="$LAUNCH_AGENTS_DIR/${label}.plist"
  if [[ ! -f "$template" ]]; then
    echo "ERROR: missing template: $template" >&2
    exit 1
  fi

  if launchctl list "$label" >/dev/null 2>&1; then
    echo "    unload $label"
    launchctl unload "$dest" 2>/dev/null || true
    launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
  fi

  subst "$template" "$dest"
  echo "    wrote $dest"
  echo "    load $label"
  launchctl load "$dest"
done

echo "==> Done"
echo "    Labels: ${LABELS[*]}"
echo "    Logs:   $LOG_DIR/"
echo "    Check:  launchctl list | grep chendren"
echo "    Health: curl -s http://127.0.0.1:11434/api/tags"
echo "            curl -s http://127.0.0.1:3143/api/health/ready"
