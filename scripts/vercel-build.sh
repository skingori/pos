#!/bin/sh
set -e

# Strip accidental quotes/whitespace from Vercel env values.
strip_url() {
  printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

DATABASE_URL="$(strip_url "${DATABASE_URL:-}")"
DIRECT_URL="$(strip_url "${DIRECT_URL:-}")"

if [ -z "$DATABASE_URL" ]; then
  echo "error: DATABASE_URL is missing in Vercel Environment Variables" >&2
  exit 1
fi

case "$DATABASE_URL" in
  postgres://*)
    DATABASE_URL="postgresql://${DATABASE_URL#postgres://}"
    ;;
esac

case "$DATABASE_URL" in
  postgresql://*)
    ;;
  *)
    scheme="${DATABASE_URL%%:*}"
    echo "error: DATABASE_URL must start with postgresql:// (got scheme: '${scheme:-empty}')" >&2
    exit 1
    ;;
esac

if [ -z "$DIRECT_URL" ]; then
  DIRECT_URL="$DATABASE_URL"
  echo "DIRECT_URL not set — using DATABASE_URL"
else
  case "$DIRECT_URL" in
    postgres://*)
      DIRECT_URL="postgresql://${DIRECT_URL#postgres://}"
      ;;
  esac
  case "$DIRECT_URL" in
    postgresql://*)
      ;;
    *)
      echo "error: DIRECT_URL must start with postgresql:// — remove it to fall back to DATABASE_URL" >&2
      exit 1
      ;;
  esac
fi

export DATABASE_URL DIRECT_URL

# Neon free tier sleeps when idle; wake it before migrate.
echo "Waking database…"
printf 'SELECT 1;\n' | npx prisma db execute --stdin --url "$DIRECT_URL" >/dev/null 2>&1 || true
sleep 3

# Parallel Vercel deploys contend for Prisma's migrate advisory lock (P1002). Retry.
migrate_with_retry() {
  attempt=1
  max=6
  while [ "$attempt" -le "$max" ]; do
    echo "prisma migrate deploy (attempt $attempt/$max)…"
    if npx prisma migrate deploy; then
      return 0
    fi
    wait=$((attempt * 8))
    echo "Migrate failed (often P1002 lock timeout). Waiting ${wait}s…"
    sleep "$wait"
    attempt=$((attempt + 1))
  done
  echo "error: prisma migrate deploy failed after $max attempts" >&2
  echo "hint: Cancel other in-progress Vercel deployments, wait 1 minute, redeploy once." >&2
  return 1
}

migrate_with_retry
npx prisma generate
npx next build
