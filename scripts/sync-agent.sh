#!/usr/bin/env bash
# Copy the keeper core and its data files into the Agent Studio project, which deploys app/agent only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/agent/plinthkeeper/app/agent"
mkdir -p "$DEST/src/keeper/data"
for f in abi policy events keeper data; do
  { echo "// Copied from packages/keeper/src/$f.ts by scripts/sync-agent.sh. Edit the original."; cat "$ROOT/packages/keeper/src/$f.ts"; } > "$DEST/src/keeper/$f.ts"
done
# The data is imported, so the bundler inlines it; keep it inside src so tsc's rootDir accepts it.
sed -i "s|'../../../data/|'./data/|" "$DEST/src/keeper/data.ts"
cp "$ROOT/data/stocks.json" "$ROOT/data/gaps-2026-09-30.json" "$ROOT/data/macro-2026.json" "$DEST/src/keeper/data/"
echo "synced keeper into $DEST"
