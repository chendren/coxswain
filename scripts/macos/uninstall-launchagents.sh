#!/usr/bin/env bash
# Unload and remove CXOS LaunchAgents (Ollama + Nexus CX).
set -euo pipefail

HOME_DIR="${HOME:?HOME is required}"
LAUNCH_AGENTS_DIR="$HOME_DIR/Library/LaunchAgents"
LABELS=(com.chendren.ollama com.chendren.nexus-cx)

usage() {
  cat <<EOF
Usage: $(basename "$0")

Unload LaunchAgents and remove plists from ~/Library/LaunchAgents:

  ${LABELS[*]}

Does not remove log files under ~/Library/Logs/coxswain/.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

echo "==> Uninstalling LaunchAgents"

for label in "${LABELS[@]}"; do
  dest="$LAUNCH_AGENTS_DIR/${label}.plist"
  if launchctl list "$label" >/dev/null 2>&1; then
    echo "    unload $label"
    if [[ -f "$dest" ]]; then
      launchctl unload "$dest" 2>/dev/null || true
    fi
    launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
    launchctl remove "$label" 2>/dev/null || true
  else
    echo "    $label not loaded"
  fi
  if [[ -f "$dest" ]]; then
    rm -f "$dest"
    echo "    removed $dest"
  else
    echo "    no plist at $dest"
  fi
done

echo "==> Done"
echo "    Remaining (should be empty): launchctl list | grep chendren || true"
