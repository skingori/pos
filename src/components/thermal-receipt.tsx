import { formatKes, formatKesAmount } from "@/lib/money";
import {
  buildAccountSlipLines,
  paymentMethodLabel,
} from "@/lib/receipt-account";

export type ThermalReceiptData = {
  receiptNo: number;
  total: number;
  discount?: number;
  subtotal?: number;
  taxAmount?: number;
  taxRate?: number;
  lines: { name: string; qty: number; unitPrice: number; lineTotal: number; unit: string }[];
  payments: { method: string; amount: number; mpesaReceipt?: string | null }[];
  customer?: { name: string; phone?: string | null } | null;
  /** Account balance before this sale (KES). Negative = store credit. */
  creditBalanceBefore?: number | null;
  /** Remaining open credit on this sale (from receivables), if known. */
  openBalance?: number | null;
  cashier?: string | null;
  completedAt?: string | Date | null;
  shopName: string;
  address?: string | null;
  phone?: string | null;
  kraPin?: string | null;
  receiptFooter: string;
  docType?: "receipt" | "bill";
};

function clip(text: string, max = 36) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function MoneyRow({
  label,
  value,
  strong,
  warn,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-2 ${
        strong ? "border-t border-black pt-1 text-[12px] font-extrabold" : ""
      } ${warn ? "font-bold text-amber-800" : ""}`}
    >
      <span className={`min-w-0 shrink break-words ${strong ? "" : "opacity-70"}`}>
        {label}
      </span>
      <span className="max-w-[58%] text-right font-mono text-[10px] leading-tight break-all tabular-nums">
        {value}
      </span>
    </div>
  );
}

export function ThermalReceipt({
  data,
  id = "thermal-receipt",
}: {
  data: ThermalReceiptData;
  id?: string | null;
}) {
  const when = data.completedAt ? new Date(data.completedAt) : new Date();
  const isBill = data.docType === "bill";
  const prevBal =
    data.creditBalanceBefore != null && Number.isFinite(data.creditBalanceBefore)
      ? Number(data.creditBalanceBefore)
      : null;
  const accountLines = buildAccountSlipLines({
    prevBal,
    payments: data.payments || [],
    isBill,
  });
  const collectLines = (data.payments || []).filter((p) => p.method !== "CREDIT");
  const creditPaid = (data.payments || [])
    .filter((p) => p.method === "CREDIT")
    .reduce((s, p) => s + p.amount, 0);
  const collected = collectLines.reduce((s, p) => s + p.amount, 0);
  const openBal =
    data.openBalance != null && Number.isFinite(data.openBalance)
      ? Number(data.openBalance)
      : Math.max(0, creditPaid);
  const showPayments = isBill
    ? collectLines.length > 0 &&
      !accountLines?.some(
        (l) => l.label === "Amount due" || l.label === "Deposit toward bill"
      )
    : data.payments.length > 0;

  const whenLabel = when.toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const showVat = (data.taxAmount || 0) > 0.009 && (data.taxRate || 0) > 0;
  const exclVat =
    showVat && typeof data.subtotal === "number"
      ? Math.max(0, data.subtotal - (data.taxAmount || 0))
      : null;
  const plainSubtotal =
    !showVat && typeof data.subtotal === "number" ? data.subtotal : null;

  return (
    <div
      id={id || undefined}
      className="thermal-receipt mx-auto overflow-hidden bg-white text-black"
    >
      <div className="space-y-1 text-center">
        <div className="text-[13px] font-bold uppercase tracking-wider leading-tight break-words">
          {data.shopName}
        </div>
        {data.address && (
          <div className="text-[10px] leading-snug break-words opacity-80">{data.address}</div>
        )}
        {data.phone && <div className="text-[10px] opacity-80">Tel: {data.phone}</div>}
        {data.kraPin && (
          <div className="text-[9px] font-semibold opacity-70">
            KRA PIN: {data.kraPin}
            {showVat ? " · VAT REGISTERED" : ""}
          </div>
        )}
        <div className="border-t border-dashed border-black/50 pt-1 text-[11px] font-bold uppercase tracking-wide">
          {isBill ? "Bill copy — not paid" : "Tax Invoice / Cash Sale"}
        </div>
      </div>

      <div className="my-2 space-y-0.5 border-y border-dashed border-black/40 py-2 text-[10px]">
        <div className="flex justify-between gap-2">
          <span className="opacity-70">Receipt No:</span>
          <span className="font-bold tabular-nums">#{data.receiptNo}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="shrink-0 opacity-70">Date & Time:</span>
          <span className="min-w-0 text-right tabular-nums break-words">{whenLabel}</span>
        </div>
        {data.cashier && (
          <div className="flex justify-between gap-2">
            <span className="opacity-70">Cashier:</span>
            <span className="max-w-[60%] text-right break-words" title={data.cashier}>
              {clip(data.cashier, 24)}
            </span>
          </div>
        )}
        {data.customer?.name && (
          <div className="flex justify-between gap-2">
            <span className="opacity-70">Customer:</span>
            <span
              className="max-w-[60%] text-right font-bold break-words"
              title={data.customer.name}
            >
              {clip(data.customer.name, 28)}
            </span>
          </div>
        )}
        {data.customer?.phone && (
          <div className="flex justify-between gap-2">
            <span className="opacity-70">Tel:</span>
            <span className="tabular-nums">{data.customer.phone}</span>
          </div>
        )}
      </div>

      <div className="border-b border-black/60 pb-1 text-[10px] font-bold uppercase tracking-wide">
        <div className="flex justify-between gap-2">
          <span>Item</span>
          <span>KSh</span>
        </div>
      </div>

      <div className="text-[11px]">
        {data.lines.map((l, i) => (
          <div
            key={i}
            className="border-b border-dashed border-black/20 py-1.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="leading-snug font-semibold break-words" title={l.name}>
                  {clip(l.name, 34)}
                </div>
                <div className="text-[9px] leading-snug break-all opacity-70">
                  {l.qty}
                  {l.unit ? ` ${clip(l.unit, 8)}` : ""} @ {formatKesAmount(l.unitPrice)}
                  {showVat ? ` · ${data.taxRate}% VAT` : ""}
                </div>
              </div>
              <div className="max-w-[42%] shrink-0 text-right font-mono text-[10px] leading-tight font-semibold break-all tabular-nums">
                {formatKesAmount(l.lineTotal)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-1 border-t-2 border-dashed border-black/50 pt-2 text-[11px]">
        {exclVat != null && (
          <MoneyRow label="Subtotal (excl. VAT)" value={formatKes(exclVat)} />
        )}
        {plainSubtotal != null && (data.discount || 0) > 0.009 && (
          <MoneyRow label="Subtotal" value={formatKes(plainSubtotal)} />
        )}
        {(data.discount || 0) > 0 && (
          <MoneyRow label="Discount" value={`−${formatKes(data.discount || 0)}`} />
        )}
        {showVat && (
          <MoneyRow label={`VAT (${data.taxRate}%)`} value={formatKes(data.taxAmount || 0)} />
        )}
        <MoneyRow label="TOTAL DUE" value={formatKes(data.total)} strong />
        {!isBill && (
          <>
            <MoneyRow label="Amount Paid" value={formatKes(collected)} />
            {openBal > 0.009 ? (
              <MoneyRow label="Outstanding" value={formatKes(openBal)} warn />
            ) : (
              <MoneyRow label="Change / Balance" value={formatKes(0)} />
            )}
          </>
        )}
      </div>

      {showPayments && (
        <div className="mt-2 space-y-0.5 overflow-hidden rounded border border-black/20 bg-slate-50 p-2 text-[10px]">
          <div className="font-bold uppercase tracking-wide opacity-80">Payment Breakdown</div>
          {(isBill ? collectLines : data.payments).map((p, i) => {
            const mode = `${paymentMethodLabel(p.method)}${p.mpesaReceipt ? ` · ${p.mpesaReceipt}` : ""}`;
            return (
              <div key={i} className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words" title={mode}>
                  {clip(mode, 22)}
                </span>
                <span className="max-w-[55%] text-right font-mono text-[9px] leading-tight break-all tabular-nums">
                  {formatKes(p.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {!isBill && accountLines && (
          <>
            <div className="my-2 border-t border-dashed border-black/40" />
            <div className="space-y-0.5 text-[10px]">
              <div className="font-semibold uppercase tracking-wide">Account</div>
              {accountLines.map((line, i) => (
                <div
                  key={i}
                  className={`flex items-start justify-between gap-2 ${
                    line.bold ? "pt-0.5 text-[11px] font-bold" : ""
                  }`}
                >
                  <span className="min-w-0 break-words">{line.label}</span>
                  <span className="max-w-[55%] text-right font-mono text-[9px] leading-tight break-all tabular-nums">
                    {line.value}
                  </span>
                </div>
              ))}
            </div>
          </>
      )}
      <div className="mt-3 space-y-1 text-center text-[9px] leading-snug opacity-70">
        {isBill ? (
          <p>Estimate only. Pay at the till to complete this sale.</p>
        ) : (
          <p className="break-words">{data.receiptFooter}</p>
        )}
      </div>
    </div>
  );
}
