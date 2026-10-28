#!/usr/bin/env bash
# Restore a gzipped pg_dump. DESTRUCTIVE — overwrites the target database.
# Usage: DATABASE_URL=... ./scripts/restore-db.sh backups/pos-YYYYMMDD-HHMMSS.sql.gz

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${1:-}"

if [[ -z "$FILE" ]]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

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

echo "WARNING: This will restore into:"
echo "  $DATABASE_URL"
read -r -p "Type RESTORE to continue: " confirm
if [[ "$confirm" != "RESTORE" ]]; then
  echo "Aborted"
  exit 1
fi

gunzip -c "$FILE" | psql "$DATABASE_URL"
echo "Restore complete."
