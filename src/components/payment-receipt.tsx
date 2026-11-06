import { formatKes } from "@/lib/money";

export type PaymentReceiptData = {
  receiptNo: number;
  amount: number;
  method: string;
  note?: string | null;
  createdAt?: string | Date | null;
  isWriteOff?: boolean;
  customer: { name: string; phone?: string | null };
  previousBalance: number;
  appliedToDebt: number;
  excessCredit: number;
  newBalance: number;
  shopName: string;
  address?: string | null;
  phone?: string | null;
  kraPin?: string | null;
  receiptFooter?: string | null;
  cashier?: string | null;
};

function balLabel(n: number) {
  if (n > 0.009) return { text: "Owes", value: formatKes(n) };
  if (n < -0.009) return { text: "Store credit", value: formatKes(-n) };
  return { text: "Settled", value: formatKes(0) };
}

export function PaymentReceipt({ data }: { data: PaymentReceiptData }) {
  const when = data.createdAt ? new Date(data.createdAt) : new Date();
  const prev = balLabel(data.previousBalance);
  const next = balLabel(data.newBalance);
  const title = data.isWriteOff ? "Write-off" : "Payment receipt";

  return (
    <div id="thermal-receipt" className="thermal-receipt mx-auto bg-white text-black">
      <div className="text-center">
        <div className="text-[15px] font-bold leading-tight">{data.shopName}</div>
        {data.address && <div className="mt-0.5 text-[10px] leading-snug">{data.address}</div>}
        {data.phone && <div className="text-[10px]">Tel: {data.phone}</div>}
        {data.kraPin && <div className="text-[10px]">PIN: {data.kraPin}</div>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="mb-2 rounded border border-black px-1 py-1 text-center text-[11px] font-bold uppercase tracking-wide">
        {title}
      </div>
      <div className="flex justify-between text-[10px]">
        <span>
          {data.isWriteOff ? "WO" : "Pay"} #{data.receiptNo}
        </span>
        <span>{when.toLocaleString("en-KE")}</span>
      </div>
      {data.cashier && <div className="text-[10px]">By: {data.cashier}</div>}
      <div className="text-[10px]">Customer: {data.customer.name}</div>
      {data.customer.phone && <div className="text-[10px]">Phone: {data.customer.phone}</div>}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Previous ({prev.text})</span>
          <span className="tabular-nums">{prev.value}</span>
        </div>
        <div className="flex justify-between font-bold text-[13px]">
          <span>{data.isWriteOff ? "Written off" : "Amount received"}</span>
          <span className="tabular-nums">{formatKes(data.amount)}</span>
        </div>
        {!data.isWriteOff && (
          <div className="flex justify-between text-[10px]">
            <span>Method</span>
            <span>{data.method}</span>
          </div>
        )}
        {data.note && (
          <div className="flex justify-between text-[10px]">
            <span>Note</span>
            <span className="max-w-[60%] text-right">{data.note}</span>
          </div>
        )}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="space-y-0.5 text-[10px]">
        <div className="flex justify-between">
          <span>Applied to debt</span>
          <span className="tabular-nums">{formatKes(data.appliedToDebt)}</span>
        </div>
        {!data.isWriteOff && (
          <div className="flex justify-between">
            <span>Excess → store credit</span>
            <span className="tabular-nums">{formatKes(data.excessCredit)}</span>
          </div>
        )}
        <div className="flex justify-between pt-0.5 text-[11px] font-bold">
          <span>New ({next.text})</span>
          <span className="tabular-nums">{next.value}</span>
        </div>
      </div>
      {data.receiptFooter && (
        <div className="mt-3 text-center text-[10px] leading-snug">{data.receiptFooter}</div>
      )}
    </div>
  );
}
