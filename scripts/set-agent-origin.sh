#!/usr/bin/env bash
# Point https://plinth-relay.vercel.app/agent (the keeper's ERC-8004 endpoint) at a new agent host, then redeploy
# the relay from main. Usage: scripts/set-agent-origin.sh https://<host>
set -euo pipefail
ORIGIN="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/relay"
vercel link --yes --project plinth-relay >/dev/null 2>&1
vercel env rm AGENT_ORIGIN production --yes >/dev/null 2>&1 || true
printf '%s' "$ORIGIN" | vercel env add AGENT_ORIGIN production >/dev/null 2>&1
rm -rf .vercel
SHA=$(git -C "$ROOT" rev-parse origin/main)
BODY="$ROOT/.relay-deploy.json"
printf '{"name":"plinth-relay","project":"prj_bJyBgsXmPX1qGT7aUiWQCm7ndnFF","target":"production","gitSource":{"type":"github","org":"jenzylove","repo":"plinth","ref":"main","sha":"%s"}}' "$SHA" > "$BODY"
cd "$ROOT"
MSYS_NO_PATHCONV=1 vercel api /v13/deployments -X POST --input .relay-deploy.json | grep -m1 '"url"'
rm -f "$BODY"
echo "AGENT_ORIGIN=$ORIGIN"
