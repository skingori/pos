# Kenya hardware Report Center

Shop-floor reports for a Kenyan hardware POS (option B: operations now, VAT ready for eTIMS later).

## Scope

- **In:** Day close, tenders, items/categories, credit & collections, stock, purchases, VAT & returns summary, CSV exports, links to cash drawer Z-report
- **Out:** Live eTIMS / KRA APIs, control numbers, invoice signing, cross-branch consolidated reports

## Tabs

| Tab | What it shows | Primary data |
|-----|---------------|--------------|
| Day close | Sales, COGS, profit, discounts, refunds, txns; daily trend; by cashier; sales detail | `Sale`, refunds |
| Tenders | Cash / M-Pesa / Card·bank / Credit totals + counts; M-Pesa refs | `Payment` |
| Items & categories | Top movers, category revenue | `SaleLine` + categories |
| Credit & collections | Credit sales, collections in period, open A/R | `Payment` CREDIT, `CustomerPayment`, `Customer` |
| Stock | Cost/retail/opened value, reorder/out table | `Product` + `BranchStock` |
| Purchases | Received POs in period by supplier | `Purchase` RECEIVED |
| VAT & returns | Gross, net ex-VAT (est.), VAT collected, refunds; disclaimer | Shop settings + sale tax + refunds |

Drawer variance / Z-report stays on **Cash → Drawer sessions** — Report Center links there instead of duplicating till math.

## API

`GET /api/reports/detailed?from=&to=`

Extra JSON fields: `byPayment[{ method, label, amount, count }]`, `mpesaPayments`, `creditSalesTotal`, `creditTxnCount`, `collections`, `collectionsTotal`, `purchases`, `purchasesTotal`, `vat`.

Server CSV `type=` values still available: `sales`, `inventory`, `customers`, `tenders`, `purchases`, `vat`, `collections`.

The Report Center **Export** menu downloads the **active tab** as **CSV**, **Excel (.xls)**, or **PDF** from the loaded data (date range auto-refreshes; no Run button).

Branch-scoped via active branch resolution (same as POS).

## eTIMS later

The VAT tab is labeled as an **internal shop summary**, not a filed KRA return. When eTIMS is added, reuse this tab for control numbers / transmission status without rewriting Day close or Tenders.
