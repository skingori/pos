# Purchases CRUD and CSV

## Behaviour

- **Row click** opens the purchase detail (PO or GRN). Suppliers tab row click filters Purchases to that supplier.
- **Edit / Delete** only for **ORDERED** (and Delete for **CANCELLED**). **RECEIVED** purchases are print/detail only — no stock reversal.
- **Print** opens the detail sheet and triggers print.
- **CSV export** downloads the current filtered purchase lines.
- **CSV import** creates **RECEIVED** purchases and **posts stock** (and GL), matching “receive now”.

## Import columns

```text
supplier,note,product_sku,product_name,qty,unit_cost,received_at,purchase_ref
```

- Product resolved by SKU first, then exact name.
- Missing suppliers are created by name.
- Rows with the same `purchase_ref` (or same supplier + note + received date) are grouped into one purchase.

## Suppliers

- **Edit** updates name / phone / email.
- **Delete** hard-deletes if unused; if the supplier has purchases, they are **deactivated** instead so history stays linked.

## API

- `GET /api/purchases` — up to 500 recent purchases
- `PATCH /api/purchases` — `action: "update" | "cancel" | "delete"`, or receive (default)
- `DELETE /api/purchases?id=` — hard delete ORDERED/CANCELLED only
- `POST /api/purchases/import` — multipart CSV → received + stock
- `PATCH /api/suppliers/:id` — update fields or `active`
- `DELETE /api/suppliers/:id` — hard delete or soft-deactivate when purchases exist
