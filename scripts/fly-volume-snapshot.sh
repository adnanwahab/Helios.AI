#!/usr/bin/env bash
# Read-only snapshot inventory by default; deliberate snapshot creation on request.
set -euo pipefail

APP=helios-ai-laws
volume_id="${1:-}"
action="${2:-list}"

if [[ ! "$volume_id" =~ ^vol_[A-Za-z0-9]+$ ]] || [[ "$action" != "list" && "$action" != "create" ]]; then
  printf 'Usage: bash scripts/fly-volume-snapshot.sh vol_YOUR_VOLUME_ID [list|create]\n' >&2
  printf 'Find the existing helios_data volume ID using: fly volumes list -a helios-ai-laws\n' >&2
  exit 2
fi
command -v fly >/dev/null || { echo 'Install or authenticate flyctl first.' >&2; exit 1; }

echo 'Existing volumes (verify the selected ID belongs to helios_data):'
fly volumes list -a "$APP"
echo
echo "Selected volume details: $volume_id"
fly volumes show "$volume_id" -a "$APP"

if [[ "$action" == "create" ]]; then
  if [[ ! -t 0 ]]; then
    echo 'Interactive confirmation required for an on-demand volume snapshot.' >&2
    exit 1
  fi
  echo 'This creates a snapshot; it does NOT delete, replace or restore the production volume.'
  read -r -p "Type helios_data to confirm this is the production data volume: " confirmation
  if [[ "$confirmation" != "helios_data" ]]; then
    echo 'Cancelled; no snapshot requested.' >&2
    exit 1
  fi
  fly volumes snapshots create "$volume_id" -a "$APP"
  echo 'Snapshot requested. It may take time to complete.'
fi

echo "Snapshot inventory for $volume_id:"
fly volumes snapshots list "$volume_id" -a "$APP"
echo 'Check that at least one recent snapshot is CREATED; a requested snapshot can still be pending.'
