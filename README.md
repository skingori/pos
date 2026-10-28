# Kenya Hardware POS

Stockflow-like point of sale for a Kenyan hardware shop.

## Setup

```bash
cp .env.example .env
docker compose up -d   # Postgres on localhost:5433
npm install
npm run db:setup
npm run dev
```

> Local Postgres already on 5432? Compose maps the container to **5433** (see `DATABASE_URL` / `DIRECT_URL` in `.env`).

Open [http://localhost:3000](http://localhost:3000).

### Demo on Vercel + Neon

See [`docs/demo-vercel.md`](docs/demo-vercel.md). Uses `vercel.json` + `npm run vercel-build` (migrate + build).

### Default users (dev)

| Email | Password | Role |
|-------|----------|------|
| admin@example.com | admin123 | ADMIN |
| manager@example.com | manager123 | MANAGER |
| cashier@example.com | cashier123 | ATTENDANT |

Seed accounts must change password on first login. Production seed requires `ALLOW_SEED=1`.

## Features

- POS: cash, M-Pesa (Daraja or mock), split pay, credit, VAT, price levels, promotions
- Inventory with buying price, markup helper, opened/quarantine + return SKUs, serials
- Purchasing + purchase orders, receivables, refunds with return conditions
- Reports, GL journals, CSV export, 80mm thermal receipts
- Settings, users, audit logs, forced password change

M-Pesa: leave Daraja env vars empty for mock STK.  
Docs: [`docs/demo-vercel.md`](docs/demo-vercel.md) · [`docs/kenya-hardware-pos-mvp.md`](docs/kenya-hardware-pos-mvp.md) · [`docs/production.md`](docs/production.md) · [`docs/commercial-pilot.md`](docs/commercial-pilot.md)
