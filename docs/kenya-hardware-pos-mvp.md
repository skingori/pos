# Kenya Hardware POS — MVP B

Single-shop POS for a Kenyan hardware store (Stockflow-like).

## Scope
- In: POS sales, cash + M-Pesa, inventory, customers, purchasing, receivables, reports, roles/audit, refunds, open/close day, **branches with per-branch stock**
- Out: stock transfers between branches, quotations, vouchers, eTIMS, offline sync, cross-branch consolidated reports

## Branches & stock
- Each **Branch** has its own till (one OPEN `PosSession` per branch) and **BranchStock** quantities (`qty`, `openedQty`, `reorderLevel`).
- Product master data (name, SKU, prices) is shared; sellable counts are not.
- Active branch resolution: open till → manager/admin `sf_branch` cookie → user’s home `branchId` → Main (`BR0001`).
- Attendants stay on their home branch. Admins/managers can switch branch from the top bar when no till is open.
- Purchases receive into the active branch; refunds restock the **sale’s** branch.
- Manage locations under **Branches** (Admin create/deactivate). Assign home branch on **Users**.
- Transfers between branches are out of scope for this MVP — adjust or receive stock per branch instead.

## Cash (drawer sessions)
- Sidebar **Cash** matches Stockflow routes:
  - `/cash/open-day` — open till for a **branch** (float); or show already-open card
  - `/cash/close-day` — session details, drawer breakdown formula, counted cash/M-Pesa, close
  - `/cash/drawer-sessions` — Branch/From/To/Status/User filters, session table, CSV export, Z-report
  - `/cash/reconciliation` — Unresolved/Resolved variance review per branch
- Sessions are always branch-scoped (one OPEN till per branch). Closing records `closedBy`.
- Cash out/in modal: type (paid in/out), amount, reason — feeds close-day expected cash.
- POS sales require an open drawer session for the active branch.
- Expected cash = opening + cash sales + paid-in − paid-out − cash refunds.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL (`docker compose up -d` → `localhost:5433`)
- NextAuth credentials (ADMIN / MANAGER / ATTENDANT)
- Safaricom Daraja STK Push (sandbox-ready; mock mode when keys missing)

## Default login (after seed)
- Email: `admin@example.com`
- Password: `admin123`

## Scripts
```bash
npm run db:push
npm run db:seed
npm run dev
```

## Env
Copy `.env.example` to `.env`. M-Pesa vars optional; without them checkout uses mock M-Pesa success.

## Buying price and sell markup
- Each product has a **buying price** (`cost`) and **sell price**.
- `ShopSettings.defaultMarkupPercent` defaults to **25%**. Suggested sell = `cost × (1 + markup/100)`.
- Inventory form: enter buying price + markup → **Use suggested** sell price; table shows margin %.
- Purchasing: receive with buying price; optional **Recalculate sell from markup**.

## Returns / conditions
On refund, each line has a condition:
- **SELLABLE** — restock to sellable `qty` (normal POS stock)
- **OPENED** — add to `openedQty` quarantine (not sold on POS until released)
- **WRITE_OFF** — no restock; unit cost kept on the refund line for audit

Managers can **Release** opened stock to sellable or **Write off** opened units from Inventory.

### Refund payout
When approving a return, choose how money goes back:
- **CASH** — hand cash; till expected cash is reduced (and a cash-out movement is logged)
- **MPESA** — send manually; optional confirmation ref; expected M-Pesa reduced on close day
- **CREDIT** — reduce customer balance / store credit (sale must have a customer)

Refund amount = original line sell price × qty returned.

## QuickBooks-style extras
- VAT (default 16%, configurable; prices include VAT by default)
- Price levels (e.g. Wholesale % off) on customers
- Promotions (% off storewide or per product)
- Purchase orders (ORDERED → receive later)
- Report center (QB-style): sales overview graphs, sales by item/customer/cashier, inventory stock status, receivables, tax & refunds; searchable/sortable data tables; CSV export
- Company settings + user management (admin)
- Health check: `GET /api/health`

See [production.md](./production.md) for deploy and [commercial-pilot.md](./commercial-pilot.md) for Phase A go-live.