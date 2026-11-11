import { formatKes, formatKesAmount } from "@/lib/money";

export type ThermalPurchaseSlipData = {
  docType: "PO" | "GRN";
  reference: string;
  poReference?: string | null;
  status: string;
  totalCost: number;
  note?: string | null;
  lines: {
    name: string;
    qty: number;
    unitCost: number;
    unit?: string;
  }[];
  supplier?: { name: string; phone?: string | null } | null;
  userName?: string | null;
  completedAt?: string | Date | null;
  shopName: string;
  address?: string | null;
  phone?: string | null;
  kraPin?: string | null;
  footer?: string | null;
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
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-2 ${
        strong ? "border-t border-black pt-1 text-[12px] font-extrabold" : ""
      }`}
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

export function ThermalPurchaseSlip({
  data,
  id = "thermal-purchase-slip",
}: {
  data: ThermalPurchaseSlipData;
  id?: string | null;
}) {
  const when = data.completedAt ? new Date(data.completedAt) : new Date();
  const isGrn = data.docType === "GRN";
  const whenLabel = when.toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const units = data.lines.reduce((s, l) => s + l.qty, 0);

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
          <div className="text-[9px] font-semibold opacity-70">KRA PIN: {data.kraPin}</div>
        )}
        <div className="border-t border-dashed border-black/50 pt-1 text-[11px] font-bold uppercase tracking-wide">
          {isGrn ? "Goods Received Note" : "Purchase Order"}
        </div>
      </div>

      <div className="my-2 space-y-0.5 border-y border-dashed border-black/40 py-2 text-[10px]">
        <div className="flex justify-between gap-2">
          <span className="opacity-70">{isGrn ? "GRN No:" : "PO No:"}</span>
          <span className="font-bold tabular-nums">{data.reference}</span>
        </div>
        {isGrn && data.poReference && (
          <div className="flex justify-between gap-2">
            <span className="opacity-70">From PO:</span>
            <span className="font-bold tabular-nums">{data.poReference}</span>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span className="shrink-0 opacity-70">Date & Time:</span>
          <span className="min-w-0 text-right tabular-nums break-words">{whenLabel}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="opacity-70">Status:</span>
          <span className="font-semibold uppercase">{data.status}</span>
        </div>
        {data.userName && (
          <div className="flex justify-between gap-2">
            <span className="opacity-70">{isGrn ? "Received by:" : "Ordered by:"}</span>
            <span className="max-w-[60%] text-right break-words" title={data.userName}>
              {clip(data.userName, 24)}
            </span>
          </div>
        )}
        {data.supplier?.name && (
          <div className="flex justify-between gap-2">
            <span className="opacity-70">Supplier:</span>
            <span
              className="max-w-[60%] text-right font-bold break-words"
              title={data.supplier.name}
            >
              {clip(data.supplier.name, 28)}
            </span>
          </div>
        )}
        {data.supplier?.phone && (
          <div className="flex justify-between gap-2">
            <span className="opacity-70">Tel:</span>
            <span className="tabular-nums">{data.supplier.phone}</span>
          </div>
        )}
        {data.note && (
          <div className="pt-1 text-[9px] leading-snug break-words opacity-80">
            Note: {data.note}
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
          <div key={i} className="border-b border-dashed border-black/20 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="leading-snug font-semibold break-words" title={l.name}>
                  {clip(l.name, 34)}
                </div>
                <div className="text-[9px] leading-snug break-all opacity-70">
                  {l.qty}
                  {l.unit ? ` ${clip(l.unit, 8)}` : ""} @ {formatKesAmount(l.unitCost)}
                </div>
              </div>
              <div className="max-w-[42%] shrink-0 text-right font-mono text-[10px] leading-tight font-semibold break-all tabular-nums">
                {formatKesAmount(l.qty * l.unitCost)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-1 border-t-2 border-dashed border-black/50 pt-2 text-[11px]">
        <MoneyRow label="Lines" value={String(data.lines.length)} />
        <MoneyRow label="Units" value={String(units)} />
        <MoneyRow
          label={isGrn ? "TOTAL RECEIVED" : "ORDER TOTAL"}
          value={formatKes(data.totalCost)}
          strong
        />
      </div>

      <div className="mt-3 space-y-1 text-center text-[9px] leading-snug opacity-70">
        <p className="break-words">
          {data.footer ||
            (isGrn
              ? "Goods received into stock. Keep for supplier records."
              : "Purchase order — receive stock when goods arrive.")}
        </p>
      </div>
    </div>
  );
}
