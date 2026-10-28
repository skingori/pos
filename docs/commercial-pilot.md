# Commercial pilot — Phase A

Goal: one hardware shop can take real money safely (hosted by you), without claiming eTIMS yet.

## Checklist

### Security
- [ ] Strong `NEXTAUTH_SECRET` (`openssl rand -base64 32`)
- [ ] `NEXTAUTH_URL` is HTTPS in production
- [ ] Seed users change password on first login (`mustChangePassword`)
- [ ] Demo credentials hidden when `NODE_ENV=production`
- [ ] Postgres not publicly reachable

### Data
- [ ] Schema applied via `prisma migrate deploy` (not only `db push`)
- [ ] Daily backup cron using `scripts/backup-db.sh`
- [ ] Restore drill once with `scripts/restore-db.sh`

### Payments
- [ ] Daraja production keys set
- [ ] `MPESA_CALLBACK_URL` reachable over HTTPS
- [ ] One live STK Push tested end-to-end

### Shop floor
- [ ] Thermal 80mm receipt prints from POS
- [ ] VAT %, shop name, address, phone, KRA PIN set in Settings
- [ ] Cash open → sale → refund → close day walked through

### Support
- [ ] `GET /api/health` monitored
- [ ] Who to call when M-Pesa fails mid-sale documented for cashiers

## Explicitly not included (Phase B+)
eTIMS, automated test suite, AP/supplier credit, multi-branch, offline mode.

## 3-day cashier UAT

### Day 1 — Sales
1. Open cash session with float
2. Cash sale (multiple lines, change qty)
3. M-Pesa sale (live or sandbox)
4. Credit sale for a customer
5. Print thermal receipt
6. Partial day close rehearsal (count drawer)

### Day 2 — Stock & returns
1. Receive a purchase (with/without serials)
2. Sell a serial-tracked item
3. Refund SELLABLE / OPENED / WRITE_OFF
4. Release or write off return SKU stock
5. Confirm inventory qty matches reality

### Day 3 — Money control
1. Mix cash + M-Pesa + credit refunds
2. Cash in/out movements
3. Collect receivable payment
4. Full close day; verify expected vs counted
5. Spot-check Accounting journals for that day

**Pass criteria:** no unexplained stock or cash variance; cashiers can complete Day 1 alone.
