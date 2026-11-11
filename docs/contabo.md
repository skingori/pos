# Deploy on Contabo VPS

One VPS runs the Next.js app and PostgreSQL via Docker. No separate API host. No Vercel required.

**No domain needed.** Use the Contabo public IP (`http://YOUR.IP:3000`). Add a domain + HTTPS later when you want.

## Deploy from your laptop (recommended)

After the server has Docker + `/opt/point_of_sale` + a working `.env` once:

```bash
# from your laptop, in this repo
chmod +x scripts/deploy-contabo.sh
DEPLOY_HOST=root@5.183.33.187 ./scripts/deploy-contabo.sh
```

What it does:
1. `rsync` code to the VPS (does **not** overwrite server `.env`)
2. `docker compose ... up -d --build`
3. `prisma migrate deploy`
4. Hits `/api/health`

One-off remote command (e.g. seed):

```bash
ssh root@5.183.33.187 'cd /opt/point_of_sale && docker compose -f docker-compose.prod.yml exec -T -e ALLOW_SEED=1 app npx tsx prisma/seed.ts'
```

## 1. Create the VPS

1. Contabo → **Cloud VPS** (Cloud VPS 10 or higher; **2GB+ RAM** recommended).
2. OS: **Ubuntu 24.04** (or 22.04).
3. Note the **public IP** and root password (or SSH key).

SSH in:

```bash
ssh root@YOUR.CONTABO.IP
```

## 2. Secure the server (first login)

```bash
apt update && apt upgrade -y
# Optional: create a non-root user and disable password root login later
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp   # only if you will use IP:3000 without a reverse proxy
ufw enable
```

Do **not** expose Postgres to the internet (Compose keeps it internal).

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
docker --version
docker compose version
```

## 4. Put the app on the server

**Option A — Git (recommended)**

```bash
apt install -y git
mkdir -p /opt && cd /opt
git clone YOUR_REPO_URL point_of_sale
cd point_of_sale
```

**Option B — Upload**

From your laptop:

```bash
rsync -avz --exclude node_modules --exclude .next ./ root@YOUR.CONTABO.IP:/opt/point_of_sale/
```

Then on the server: `cd /opt/point_of_sale`

## 5. Create `.env`

```bash
cd /opt/point_of_sale
cp .env.example .env
nano .env
```

Set at least:

```bash
# Strong DB password (also used by docker-compose.prod.yml)
POSTGRES_PASSWORD=pick-a-long-random-password

# App ↔ DB (Compose overrides these to use the `db` service; keep for clarity)
DATABASE_URL="postgresql://pos:pick-a-long-random-password@db:5432/kenya_hardware_pos?schema=public"
DIRECT_URL="postgresql://pos:pick-a-long-random-password@db:5432/kenya_hardware_pos?schema=public"

# No domain — use your Contabo IP + port 3000 (must match the browser URL exactly):
NEXTAUTH_URL="http://YOUR.CONTABO.IP:3000"

NEXTAUTH_SECRET="$(openssl rand -base64 32)"
# paste the openssl output as NEXTAUTH_SECRET=...

SHOP_NAME="Your Shop Name"
NEXT_PUBLIC_SHOP_NAME="Your Shop Name"
NODE_ENV=production

# Leave M-Pesa empty until you have HTTPS + a public callback URL
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=
MPESA_PASSKEY=
MPESA_CALLBACK_URL=
```

Generate the secret:

```bash
openssl rand -base64 32
```

Use the **same** password in `POSTGRES_PASSWORD`, `DATABASE_URL`, and `DIRECT_URL`.

## 6. Build and start

```bash
cd /opt/point_of_sale
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
```

Wait until migrate finishes and the app listens on port 3000.

Health check:

```bash
curl -s http://127.0.0.1:3000/api/health
# → {"ok":true} (or similar)
```

From your browser: `http://YOUR.CONTABO.IP:3000`

## 7. Seed admin user (first time only)

```bash
cd /opt/point_of_sale
docker compose -f docker-compose.prod.yml exec -e ALLOW_SEED=1 app npx tsx prisma/seed.ts
```

Login: `admin@example.com` / `admin123` — you will be forced to change the password.

## 8. Domain + HTTPS (recommended when ready)

1. Point an `A` record: `pos.yourdomain.com` → Contabo IP.
2. Install Caddy:

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

3. `/etc/caddy/Caddyfile`:

```
pos.yourdomain.com {
  reverse_proxy 127.0.0.1:3000
}
```

4. Reload Caddy: `systemctl reload caddy`
5. Update `.env`:

```bash
NEXTAUTH_URL="https://pos.yourdomain.com"
```

6. Restart app: `docker compose -f docker-compose.prod.yml up -d`
7. Close public 3000 if you want only HTTPS: `ufw delete allow 3000/tcp`

## 9. Backups

On the host (install `postgresql-client` if needed):

```bash
# Dump from the running DB container
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U pos kenya_hardware_pos | gzip > /opt/backups/pos-$(date +%F).sql.gz
```

Or use the project scripts with a URL pointed at the container network. Keep copies **off** the VPS (download weekly).

## 10. Updates (new code)

```bash
cd /opt/point_of_sale
git pull   # or rsync again
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run automatically on container start (`prisma migrate deploy` in the Dockerfile).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `CustomerPayment.saleId` / column does not exist | Pull latest migrations, then `docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy` (or recreate with `down -v` if empty DB) |
| Docker build: Prisma schema not found during `npm ci` | Pull latest Dockerfile (`npm ci --ignore-scripts`); rebuild |
| Can't open site | Contabo firewall / UFW: allow 3000 or 80/443 |
| Login loops / CSRF | `NEXTAUTH_URL` must match the URL in the browser exactly (`http` vs `https`, IP vs domain, port). Secure cookies are off when `NEXTAUTH_URL` is `http://` |
| Login click does nothing / stays on login | Rebuild after auth cookie fix; ensure seed ran; `NEXTAUTH_SECRET` must not be the example value |
| App can't reach DB | Password mismatch between `.env` and `POSTGRES_PASSWORD`; check `docker compose ... logs db` |
| Out of memory on build | Use a 4GB VPS, or build on your laptop and push an image |
| Seed fails | `ALLOW_SEED=1` must be set for that command only |

## Checklist

- [ ] VPS Ubuntu + Docker
- [ ] Strong `POSTGRES_PASSWORD` + `NEXTAUTH_SECRET`
- [ ] `docker compose -f docker-compose.prod.yml up -d --build`
- [ ] `/api/health` OK
- [ ] Seed + change password
- [ ] (Later) Domain + Caddy HTTPS
- [ ] Daily DB backup off-box

See also [production.md](./production.md) and [commercial-pilot.md](./commercial-pilot.md).
