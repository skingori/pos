# Demo deploy: Vercel + Prisma (Neon)

Quick public demo. Not a shop-floor production setup (see [production.md](./production.md) for Docker/VPS).

## 1. Create a Postgres database

1. Sign up at [Neon](https://neon.tech) (or Prisma Postgres).
2. Create a project / database.
3. Copy the **direct** connection string from Neon (host **without** `-pooler`):

```text
postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/DB?sslmode=require
```

Set that as **`DATABASE_URL`** on Vercel. This app uses Prisma interactive transactions (sales, stock); Neon’s **pooler** URL causes `P2028 Transaction not found`.

Optional: set the same value as `DIRECT_URL`, or leave `DIRECT_URL` empty (build falls back to `DATABASE_URL`).

Do **not** use a host like `ep-….‑pooler.…neon.tech` for this demo.

## 2. Push the repo to GitHub

Vercel deploys from Git. Commit and push this project, then import it in Vercel.

## 3. Create the Vercel project

1. [vercel.com/new](https://vercel.com/new) → import the repo.
2. Framework: **Next.js** (auto).
3. Add environment variables (Production + Preview):

| Name | Value |
|------|--------|
| `DATABASE_URL` | Neon connection URL (required) |
| `DIRECT_URL` | Neon **direct** URL (optional; falls back to `DATABASE_URL`) |
| `NEXTAUTH_URL` | `https://YOUR_PROJECT.vercel.app` (update after first deploy if needed) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `SHOP_NAME` | Your demo shop name |
| `NEXT_PUBLIC_SHOP_NAME` | Same as shop name |
| `MPESA_ENV` | `sandbox` |
| `ALLOW_SEED` | leave unset on Vercel (seed from your laptop) |

Leave M-Pesa Daraja keys empty to use **mock** STK.

4. Deploy. Build runs `npm run vercel-build` (`migrate deploy` + `next build`) via `vercel.json`.

## 4. Seed demo users (once)

From your machine, pointing at Neon:

```bash
export DATABASE_URL="postgresql://..."   # same as Vercel
export DIRECT_URL="postgresql://..."
export ALLOW_SEED=1
npm run db:seed
```

Default logins (must change password on first login):

| Email | Password | Role |
|-------|----------|------|
| admin@example.com | admin123 | ADMIN |
| manager@example.com | manager123 | MANAGER |
| cashier@example.com | cashier123 | ATTENDANT |

## 5. After first deploy

1. Set `NEXTAUTH_URL` to the real `https://….vercel.app` URL and **redeploy**.
2. Open the site → log in → open a till → sell cash / credit.
3. Prefer products **without** photo uploads for the demo (Vercel disk is ephemeral).

## Local vs demo

| | Local (`docker compose`) | Demo (Vercel + Neon) |
|--|--------------------------|----------------------|
| `DATABASE_URL` | `localhost:5433` | Neon pooled |
| `DIRECT_URL` | same as `DATABASE_URL` | Neon direct |
| Images | `public/uploads` | skip / add Blob later |
| Build | `npm run build` | `npm run vercel-build` |

## Redeploy / migrate

Every Vercel production build runs `prisma migrate deploy` against Neon. New migrations in `prisma/migrations/` apply automatically on the next deploy.
