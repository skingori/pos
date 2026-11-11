#!/usr/bin/env bash
# Deploy this repo from your laptop to Contabo.
# Usage:
#   DEPLOY_HOST=root@5.183.33.187 ./scripts/deploy-contabo.sh
# Optional:
#   DEPLOY_PATH=/opt/point_of_sale
#   DEPLOY_SSH_KEY=~/.ssh/id_ed25519

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-}"
REMOTE_PATH="${DEPLOY_PATH:-/opt/point_of_sale}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$DEPLOY_SSH_KEY")
fi

if [[ -z "$HOST" ]]; then
  echo "Set DEPLOY_HOST, e.g.:" >&2
  echo "  DEPLOY_HOST=root@5.183.33.187 ./scripts/deploy-contabo.sh" >&2
  exit 1
fi

echo "==> Syncing to $HOST:$REMOTE_PATH"
ssh "${SSH_OPTS[@]}" "$HOST" "mkdir -p '$REMOTE_PATH'"
rsync -az --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude '.env' \
  --exclude 'backups/' \
  --exclude '.DS_Store' \
  -e "ssh ${SSH_OPTS[*]}" \
  "$ROOT/" "$HOST:$REMOTE_PATH/"

echo "==> Building & restarting containers"
ssh "${SSH_OPTS[@]}" "$HOST" "cd '$REMOTE_PATH' && docker compose -f docker-compose.prod.yml up -d --build"

echo "==> Applying migrations"
ssh "${SSH_OPTS[@]}" "$HOST" "cd '$REMOTE_PATH' && docker compose -f docker-compose.prod.yml exec -T app npx prisma migrate deploy"

echo "==> Health check"
ssh "${SSH_OPTS[@]}" "$HOST" "curl -sf http://127.0.0.1:3000/api/health && echo"

echo "Done. Open the URL in NEXTAUTH_URL on the server (e.g. http://YOUR.IP:3000)."
