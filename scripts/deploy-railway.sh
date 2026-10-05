#!/usr/bin/env bash
# Deploy the Plinth keeper agent (the Agent Studio project) to Railway as an always-on container.
# Builds the same single-file bundle `bag deploy` makes, adds a Dockerfile, sets the agent's runtime env from the
# git-ignored .studio/ (never printed), and uploads. Needs RAILWAY_API_TOKEN (or ~/.plinth-secrets/railway.token).
#   scripts/deploy-railway.sh            build, set variables, deploy
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT="$ROOT/agent/plinthkeeper/app/agent"
STUDIO="$ROOT/agent/plinthkeeper/.studio"
OUT="$ROOT/deploy/railway"
export RAILWAY_API_TOKEN="${RAILWAY_API_TOKEN:-$(cat "$HOME/.plinth-secrets/railway.token")}"
WALLET=$(grep -E '^address = "0x' "$AGENT/studio.toml" | head -1 | grep -oE '0x[0-9a-fA-F]{40}')

# 1. Bundle (Studio's own zip builder: one unifiedMain.js plus package.json and studio.toml).
rm -rf "$OUT/app" && mkdir -p "$OUT/app"
CLI="$(npm root -g)/@bnbagent/studio-cli/dist"
CHUNK=$(grep -l "async function buildZip" "$CLI"/*.js | head -1)
ZIP="$(cygpath -m "${LOCALAPPDATA:-/tmp}/Temp")/plinth-railway.zip"
(cd "$AGENT" && node --input-type=module -e "
  import { buildZip } from 'file:///$(cygpath -m "$CHUNK")';
  const r = await buildZip(process.cwd(), '$ZIP', { protocols: ['A2A'] });
  console.log('bundle', r.entrypoint);")
python -c "import zipfile; zipfile.ZipFile(r'$ZIP').extractall(r'$(cygpath -w "$OUT/app")')"
cat > "$OUT/app/Dockerfile" <<'EOF'
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node . /app/
USER node
EXPOSE 9000
CMD ["node", "unifiedMain.js"]
EOF

# 2. Runtime env: everything in .studio/.env.local plus the keystore. Values go straight to Railway.
cd "$OUT/app"
railway status >/dev/null 2>&1 || { echo "run: (cd $OUT/app && railway link) first"; exit 1; }
ARGS=()
while IFS= read -r line; do
  [[ "$line" =~ ^[A-Z0-9_]+= ]] || continue
  key="${line%%=*}"
  case "$key" in CREATEOS_API_KEY|CREATEOS_WALLET_PRIVATE_KEY) continue ;; esac
  val="${line#*=}"; val="${val%$'\r'}"; val="${val%\"}"; val="${val#\"}"
  ARGS+=(--set "$key=$val")
done < "$STUDIO/.env.local"
ARGS+=(--set "WALLET_KEYSTORE_JSON=$(cat "$STUDIO/wallets/$WALLET.json")")
ARGS+=(--set "AGENT_PORT=9000" --set "PORT=9000" --set "AGENT_HOST=0.0.0.0" --set "OTEL_TRACES_EXPORTER=none")
ARGS+=(--set "STUDIO_AUDIT_LOG_PATH=/tmp/.studio/audit-log.jsonl" --set "BNBAGENT_DELIVERABLE_STORAGE_MODE=byos")
railway variables --skip-deploys "${ARGS[@]}" >/dev/null
echo "variables set (${#ARGS[@]} flags)"

# 3. Deploy.
railway up --detach
