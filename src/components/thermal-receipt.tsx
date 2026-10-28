import { formatKes } from "@/lib/money";

export type ThermalReceiptData = {
  receiptNo: number;
  total: number;
  discount?: number;
  subtotal?: number;
  taxAmount?: number;
  taxRate?: number;
  lines: { name: string; qty: number; unitPrice: number; lineTotal: number; unit: string }[];
  payments: { method: string; amount: number; mpesaReceipt?: string | null }[];
  customer?: { name: string } | null;
  /** Account balance before this credit sale (KES). */
  creditBalanceBefore?: number | null;
  cashier?: string | null;
  completedAt?: string | Date | null;
  shopName: string;
  address?: string | null;
  phone?: string | null;
  kraPin?: string | null;
  receiptFooter: string;
  docType?: "receipt" | "bill";
};

function creditCharge(payments: ThermalReceiptData["payments"]) {
  return payments
    .filter((p) => p.method === "CREDIT")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
}

export function ThermalReceipt({ data }: { data: ThermalReceiptData }) {
  const when = data.completedAt ? new Date(data.completedAt) : new Date();
  const isBill = data.docType === "bill";
  const onAccount = creditCharge(data.payments);
  const prevBal =
    data.creditBalanceBefore != null && Number.isFinite(data.creditBalanceBefore)
      ? Number(data.creditBalanceBefore)
      : null;
  const showAccount = onAccount > 0.009 || (isBill && prevBal != null && prevBal > 0.009);
  const newBal =
    prevBal != null ? prevBal + (isBill ? onAccount || 0 : onAccount) : null;
  return (
    <div id="thermal-receipt" className="thermal-receipt mx-auto bg-white text-black">
      <div className="text-center">
        <div className="text-[15px] font-bold leading-tight">{data.shopName}</div>
        {data.address && <div className="mt-0.5 text-[10px] leading-snug">{data.address}</div>}
        {data.phone && <div className="text-[10px]">Tel: {data.phone}</div>}
        {data.kraPin && <div className="text-[10px]">PIN: {data.kraPin}</div>}
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      {isBill && (
        <div className="mb-2 rounded border border-black px-1 py-1 text-center text-[11px] font-bold uppercase tracking-wide">
          Bill copy — not paid
        </div>
      )}

      <div className="flex justify-between text-[10px]">
        <span>{isBill ? "Bill preview" : `Receipt #${data.receiptNo}`}</span>
        <span>{when.toLocaleString("en-KE")}</span>
      </div>
      {data.cashier && <div className="text-[10px]">Cashier: {data.cashier}</div>}
      {data.customer && <div className="text-[10px]">Customer: {data.customer.name}</div>}

      <div className="my-2 border-t border-dashed border-black" />

      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left">
            <th className="pb-1 font-semibold">Item</th>
            <th className="pb-1 text-right font-semibold">Amt</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i}>
              <td className="align-top py-0.5 pr-2">
                <div className="leading-snug">{l.name}</div>
                <div className="text-[10px] opacity-80">
                  {l.qty} {l.unit} × {formatKes(l.unitPrice)}
                </div>
              </td>
              <td className="align-top whitespace-nowrap py-0.5 text-right tabular-nums">
                {formatKes(l.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="space-y-0.5 text-[11px]">
        {typeof data.subtotal === "number" && (
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatKes(data.subtotal)}</span>
          </div>
        )}
        {(data.discount || 0) > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span className="tabular-nums">−{formatKes(data.discount || 0)}</span>
          </div>
        )}
        {(data.taxAmount || 0) > 0 && (
          <div className="flex justify-between">
            <span>VAT {data.taxRate}%</span>
            <span className="tabular-nums">{formatKes(data.taxAmount || 0)}</span>
          </div>
        )}
        <div className="flex justify-between pt-1 text-[13px] font-bold">
          <span>TOTAL</span>
          <span className="tabular-nums">{formatKes(data.total)}</span>
        </div>
      </div>

      {!isBill && data.payments.length > 0 && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="space-y-0.5 text-[10px]">
            {data.payments.map((p, i) => (
              <div key={i} className="flex justify-between">
                <span>
                  {p.method}
                  {p.mpesaReceipt ? ` ${p.mpesaReceipt}` : ""}
                </span>
                <span className="tabular-nums">{formatKes(p.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {showAccount && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="space-y-0.5 text-[10px]">
            <div className="font-semibold uppercase tracking-wide">Account</div>
            {prevBal != null && (
              <div className="flex justify-between">
                <span>Previous balance</span>
                <span className="tabular-nums">{formatKes(prevBal)}</span>
              </div>
            )}
            {onAccount > 0.009 && (
              <div className="flex justify-between">
                <span>{isBill ? "This bill (credit)" : "This credit"}</span>
                <span className="tabular-nums">{formatKes(onAccount)}</span>
              </div>
            )}
            {newBal != null && (
              <div className="flex justify-between pt-0.5 text-[11px] font-bold">
                <span>{isBill ? "Balance if on credit" : "New balance"}</span>
                <span className="tabular-nums">{formatKes(newBal)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {isBill ? (
        <div className="mt-3 text-center text-[10px] leading-snug">
          Estimate only. Pay at the till to complete this sale.
        </div>
      ) : (
        <div className="mt-3 text-center text-[10px] leading-snug">{data.receiptFooter}</div>
      )}
      <div className="mt-2 text-center text-[9px] opacity-70">Powered by Stockflow POS</div>
    </div>
  );
}
