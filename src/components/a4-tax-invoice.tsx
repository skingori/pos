import { formatKes, formatKesAmount } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/receipt-account";
import type { ThermalReceiptData } from "@/components/thermal-receipt";

function clip(text: string, max = 48) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function A4TaxInvoice({
  data,
  openBalance = 0,
}: {
  data: ThermalReceiptData;
  openBalance?: number;
}) {
  const when = data.completedAt ? new Date(data.completedAt) : new Date();
  const exclVat =
    typeof data.subtotal === "number" && (data.taxAmount || 0) > 0
      ? Math.max(0, data.subtotal - (data.taxAmount || 0))
      : data.subtotal;
  const collected = (data.payments || [])
    .filter((p) => p.method !== "CREDIT")
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div
      id="a4-tax-invoice"
      className="a4-tax-invoice mx-auto w-full max-w-[720px] overflow-hidden rounded-xl border border-[var(--sf-border)] bg-white p-5 text-[var(--sf-brand)] shadow-[var(--sf-shadow)]"
    >
      <div className="a4-header flex items-start justify-between gap-4 border-b border-[var(--sf-border)] pb-4">
        <div className="a4-shop min-w-0 flex-1">
          <h2 className="a4-shop-name sf-display m-0 truncate text-xl font-extrabold tracking-tight" title={data.shopName}>
            {data.shopName}
          </h2>
          {data.address ? (
            <p className="a4-muted mt-0.5 truncate text-xs text-[var(--sf-muted)]" title={data.address}>
              {data.address}
            </p>
          ) : null}
          {data.phone ? (
            <p className="a4-muted mt-0.5 text-xs text-[var(--sf-muted)]">Tel: {data.phone}</p>
          ) : null}
          {data.kraPin ? (
            <p className="a4-muted a4-strong mt-0.5 text-xs font-bold text-[var(--sf-muted)]">
              KRA PIN: {data.kraPin}
            </p>
          ) : null}
        </div>
        <div className="a4-meta shrink-0 text-right">
          <p className="a4-doc-title m-0 text-[0.7rem] font-bold tracking-wider text-[var(--sf-accent)] uppercase">
            Commercial Tax Invoice
          </p>
          <p className="a4-receipt-no mt-1 font-mono text-[0.95rem] font-bold">#{data.receiptNo}</p>
          <p className="a4-muted mt-0.5 text-xs text-[var(--sf-muted)]">
            {when.toLocaleString("en-KE", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      <div className="a4-parties mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="a4-card min-w-0 rounded-lg border border-[var(--sf-border)] bg-[var(--sf-surface-2)] p-3 text-xs">
          <p className="a4-label mb-1 text-[0.65rem] font-bold tracking-wider text-[var(--sf-muted)] uppercase">
            Bill To
          </p>
          <p
            className="a4-strong m-0 truncate font-bold"
            title={data.customer?.name || "Walk-in Customer"}
          >
            {clip(data.customer?.name || "Walk-in Customer", 40)}
          </p>
          {data.customer?.phone ? (
            <p className="a4-muted mt-0.5 text-[var(--sf-muted)]">{data.customer.phone}</p>
          ) : null}
        </div>
        <div className="a4-card min-w-0 rounded-lg border border-[var(--sf-border)] bg-[var(--sf-surface-2)] p-3 text-xs">
          <p className="a4-label mb-1 text-[0.65rem] font-bold tracking-wider text-[var(--sf-muted)] uppercase">
            Sale Meta
          </p>
          <p className="m-0 truncate" title={data.cashier || undefined}>
            Cashier: {clip(data.cashier || "—", 28)}
          </p>
          <p className="m-0">Status: {openBalance > 0.009 ? "Balance due" : "Settled"}</p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="a4-table w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col className="a4-col-desc" style={{ width: "40%" }} />
            <col className="a4-col-qty" style={{ width: "12%" }} />
            <col className="a4-col-num" style={{ width: "24%" }} />
            <col className="a4-col-num" style={{ width: "24%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className="a4-col-desc border-b border-[var(--sf-border-strong)] py-2 pr-2 text-left text-[0.65rem] font-bold tracking-wide text-[var(--sf-muted)] uppercase">
                Description
              </th>
              <th className="a4-col-qty border-b border-[var(--sf-border-strong)] py-2 pr-1 text-left text-[0.65rem] font-bold tracking-wide text-[var(--sf-muted)] uppercase">
                Qty
              </th>
              <th className="a4-col-num border-b border-[var(--sf-border-strong)] py-2 pl-1 text-right text-[0.65rem] font-bold tracking-wide text-[var(--sf-muted)] uppercase">
                Unit (KSh)
              </th>
              <th className="a4-col-num border-b border-[var(--sf-border-strong)] py-2 pl-1 text-right text-[0.65rem] font-bold tracking-wide text-[var(--sf-muted)] uppercase">
                Total (KSh)
              </th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i}>
                <td
                  className="a4-col-desc border-b border-[var(--sf-border)] py-2 pr-2 align-top break-words"
                  title={l.name}
                >
                  {clip(l.name, 42)}
                </td>
                <td
                  className="a4-col-qty border-b border-[var(--sf-border)] py-2 pr-1 align-top tabular-nums"
                  title={`${l.qty} ${l.unit}`}
                >
                  {l.qty}
                  {l.unit ? (
                    <span className="block truncate text-[0.65rem] text-[var(--sf-muted)]">
                      {clip(l.unit, 10)}
                    </span>
                  ) : null}
                </td>
                <td className="a4-col-num border-b border-[var(--sf-border)] py-2 pl-1 text-right align-top font-mono text-[0.7rem] leading-snug tabular-nums">
                  {formatKesAmount(l.unitPrice)}
                </td>
                <td className="a4-col-num a4-strong border-b border-[var(--sf-border)] py-2 pl-1 text-right align-top font-mono text-[0.7rem] leading-snug font-bold tabular-nums">
                  {formatKesAmount(l.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="a4-totals ml-auto mt-4 w-full max-w-[17rem] min-w-0 text-xs">
        {exclVat != null ? (
          <div className="a4-total-row flex items-baseline justify-between gap-3 py-0.5 tabular-nums">
            <span className="shrink-0 text-[var(--sf-muted)]">Subtotal (excl. VAT)</span>
            <span className="min-w-0 truncate text-right font-mono" title={formatKes(exclVat)}>
              {formatKes(exclVat)}
            </span>
          </div>
        ) : null}
        {(data.discount || 0) > 0 ? (
          <div className="a4-total-row flex items-baseline justify-between gap-3 py-0.5 tabular-nums">
            <span className="shrink-0 text-[var(--sf-muted)]">Discount</span>
            <span className="min-w-0 truncate text-right font-mono">
              −{formatKes(data.discount || 0)}
            </span>
          </div>
        ) : null}
        {(data.taxAmount || 0) > 0 ? (
          <div className="a4-total-row flex items-baseline justify-between gap-3 py-0.5 tabular-nums">
            <span className="shrink-0 text-[var(--sf-muted)]">VAT ({data.taxRate}%)</span>
            <span className="min-w-0 truncate text-right font-mono" title={formatKes(data.taxAmount || 0)}>
              {formatKes(data.taxAmount || 0)}
            </span>
          </div>
        ) : null}
        <div className="a4-total-row a4-total-due mt-1.5 flex items-baseline justify-between gap-3 border-t border-[var(--sf-border-strong)] pt-2 text-sm font-extrabold tabular-nums">
          <span className="shrink-0">Total due</span>
          <span className="min-w-0 truncate text-right font-mono" title={formatKes(data.total)}>
            {formatKes(data.total)}
          </span>
        </div>
        <div className="a4-total-row flex items-baseline justify-between gap-3 py-0.5 tabular-nums">
          <span className="shrink-0 text-[var(--sf-muted)]">Amount paid</span>
          <span className="min-w-0 truncate text-right font-mono">{formatKes(collected)}</span>
        </div>
        {openBalance > 0.009 ? (
          <div className="a4-total-row a4-outstanding flex items-baseline justify-between gap-3 py-0.5 font-bold text-amber-800 tabular-nums">
            <span className="shrink-0">Outstanding</span>
            <span className="min-w-0 truncate text-right font-mono" title={formatKes(openBalance)}>
              {formatKes(openBalance)}
            </span>
          </div>
        ) : null}
      </div>

      {data.payments.length ? (
        <div className="a4-payments mt-4 rounded-lg border border-[var(--sf-border)] bg-[var(--sf-surface-2)] p-3 text-xs">
          <p className="a4-label mb-1 text-[0.65rem] font-bold tracking-wider text-[var(--sf-muted)] uppercase">
            Payments
          </p>
          <ul className="m-0 list-none p-0">
            {data.payments.map((p, i) => {
              const method = `${paymentMethodLabel(p.method)}${p.mpesaReceipt ? ` · ${p.mpesaReceipt}` : ""}`;
              return (
                <li
                  key={i}
                  className="a4-total-row flex items-baseline justify-between gap-3 py-0.5 tabular-nums"
                >
                  <span className="min-w-0 truncate" title={method}>
                    {clip(method, 36)}
                  </span>
                  <span className="shrink-0 font-mono">{formatKes(p.amount)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <p className="a4-footer mt-6 text-center text-[0.7rem] text-[var(--sf-muted)]">
        {data.receiptFooter || "Thank you for your business."}
      </p>
    </div>
  );
}
