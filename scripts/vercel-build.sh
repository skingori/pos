#!/bin/sh
set -e

# Prisma schema requires DIRECT_URL (Neon non-pooler). Fall back to DATABASE_URL for demos.
if [ -z "$DIRECT_URL" ]; then
  if [ -z "$DATABASE_URL" ]; then
    echo "error: DATABASE_URL must be set for vercel-build" >&2
    exit 1
  fi
  export DIRECT_URL="$DATABASE_URL"
  echo "DIRECT_URL not set — using DATABASE_URL"
fi

npx prisma migrate deploy
npx prisma generate
npx next build
