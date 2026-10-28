#!/usr/bin/env bash
# Daily Postgres backup for Kenya Hardware POS.
# Usage: DATABASE_URL=postgresql://... ./scripts/backup-db.sh
# Cron example: 15 2 * * * cd /opt/pos && DATABASE_URL=... ./scripts/backup-db.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f "$ROOT/.env" ]]; then
    # shellcheck disable=SC1091
    set -a
    source "$ROOT/.env"
    set +a
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/pos-$STAMP.sql.gz"

echo "Backing up to $FILE"
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip -c > "$FILE"
ls -lh "$FILE"

find "$BACKUP_DIR" -name 'pos-*.sql.gz' -type f -mtime +"$KEEP_DAYS" -delete
echo "Done. Kept backups newer than $KEEP_DAYS days."
