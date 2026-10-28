# Production deployment

## Requirements
- PostgreSQL 14+
- Node.js 20+
- HTTPS reverse proxy (Nginx/Caddy) for secure cookies
- Safaricom Daraja credentials for live M-Pesa

See also [commercial-pilot.md](./commercial-pilot.md) for the Phase A go-live checklist.

## Environment
```bash
DATABASE_URL=postgresql://USER:PASS@HOST:5432/kenya_hardware_pos?schema=public
NEXTAUTH_URL=https://pos.yourdomain.com
NEXTAUTH_SECRET=<openssl rand -base64 32>
SHOP_NAME=Your Hardware Shop
NEXT_PUBLIC_SHOP_NAME=Your Hardware Shop
NODE_ENV=production

MPESA_ENV=production
MPESA_CONSUMER_KEY=...
MPESA_CONSUMER_SECRET=...
MPESA_SHORTCODE=...
MPESA_PASSKEY=...
MPESA_CALLBACK_URL=https://pos.yourdomain.com/api/mpesa/callback
```

## Deploy steps (fresh database)
```bash
docker compose up -d   # or managed Postgres
npm ci
npx prisma migrate deploy
# First bootstrap only:
ALLOW_SEED=1 npm run db:seed
npm run build
npm start
```

Or: `docker build -t kenya-pos . && docker run --env-file .env -p 3000:3000 kenya-pos`

After first login with a seed account you **must** change the password (forced).

### Existing DB that was created with `db push`
Bring schema current, then mark the baseline migration as already applied:
```bash
npx prisma db push
npx prisma migrate resolve --applied 20261027120000_init
```
Later deploys use `npx prisma migrate deploy` only.

## Backups
```bash
chmod +x scripts/backup-db.sh scripts/restore-db.sh
DATABASE_URL=... ./scripts/backup-db.sh
# Restore drill:
DATABASE_URL=... ./scripts/restore-db.sh backups/pos-YYYYMMDD-HHMMSS.sql.gz
```

Cron (02:15 daily):
```
15 2 * * * cd /opt/pos && ./scripts/backup-db.sh >> /var/log/pos-backup.log 2>&1
```

## Health check
`GET /api/health` → `{ ok: true }`

## Hardening checklist
- [ ] Strong `NEXTAUTH_SECRET` (never the example value)
- [ ] HTTPS only (`NEXTAUTH_URL` https)
- [ ] Change seed passwords on first login
- [ ] Restrict DB network access
- [ ] Daily Postgres backups + one restore drill
- [ ] Set VAT / address / phone / KRA PIN under Settings
- [ ] Point M-Pesa callback at public HTTPS URL
- [ ] Print one 80mm thermal receipt from POS
