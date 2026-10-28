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

# Migrations: run from your laptop (`npx prisma migrate deploy`) after schema changes.
# Running migrate on every Vercel build causes P1002 advisory-lock timeouts (parallel deploys + Neon sleep).
# Set RUN_MIGRATE=1 in Vercel env only when you intentionally want migrate during build.
if [ "${RUN_MIGRATE:-}" = "1" ]; then
  echo "RUN_MIGRATE=1 — waking DB and applying migrations…"
  printf 'SELECT 1;\n' | npx prisma db execute --stdin --url "$DIRECT_URL" >/dev/null 2>&1 || true
  sleep 2
  npx prisma migrate deploy
else
  echo "Skipping migrate on Vercel (schema already applied locally). Set RUN_MIGRATE=1 to enable."
fi

npx prisma generate
npx next build
