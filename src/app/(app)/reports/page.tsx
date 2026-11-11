"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatKes, formatMoneyParts } from "@/lib/money";
import {
  downloadReportCsv,
  downloadReportExcel,
  downloadReportPdf,
} from "@/lib/report-export";
import { DataTable } from "@/components/data-table";
import { useFixedMenu } from "@/components/ui/use-fixed-menu";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Report = {
  from: string;
  to: string;
  salesTotal: number;
  taxTotal: number;
  discountTotal: number;
  costTotal: number;
  profit: number;
  refundTotal: number;
  transactions: number;
  byCashier: { name: string; sales: number; txns: number; profit: number }[];
  byPayment: { method: string; label: string; amount: number; count: number }[];
  mpesaPayments: {
    id: string;
    receiptNo: number;
    amount: number;
    mpesaReceipt: string | null;
    phone: string | null;
    date: string;
    customer: string;
  }[];
  creditSalesTotal: number;
  creditTxnCount: number;
  collections: {
    id: string;
    receiptNo: number;
    date: string;
    customer: string;
    phone: string | null;
    amount: number;
    method: string;
    methodLabel: string;
    note: string | null;
    isWriteOff: boolean;
    isStoreCreditReversal: boolean;
    saleReceiptNo: number | null;
    collectedBy: string;
  }[];
  collectionsTotal: number;
  purchases: {
    id: string;
    date: string;
    supplier: string;
    receivedBy: string;
    totalCost: number;
    lines: number;
    items: string;
    note: string | null;
  }[];
  purchasesTotal: number;
  vat: {
    rate: number;
    pricesIncludeVat: boolean;
    salesGross: number;
    vatCollected: number;
    netExVat: number;
    discountTotal: number;
    refundTotal: number;
  };
  byCustomer: { name: string; sales: number; txns: number }[];
  byCategory: { name: string; qty: number; revenue: number }[];
  dailySales: { date: string; sales: number; profit: number; txns: number }[];
  topItems: {
    name: string;
    sku: string;
    qty: number;
    revenue: number;
    cost: number;
    profit: number;
  }[];
  inventoryValue: number;
  retailValue: number;
  openedValue: number;
  lowStockCount: number;
  stockStatus: {
    id: string;
    name: string;
    sku: string;
    category: string;
    qty: number;
    openedQty: number;
    reorderLevel: number;
    cost: number;
    sellPrice: number;
    stockValue: number;
    retailValue: number;
    status: string;
  }[];
  receivables: {
    id: string;
    name: string;
    phone: string | null;
    balance: number;
    creditLimit: number;
  }[];
  receivablesTotal: number;
  salesTable: {
    id: string;
    receiptNo: number;
    date: string;
    cashier: string;
    customer: string;
    items: number;
    tax: number;
    total: number;
    profit: number;
    payments: string;
    status: string;
  }[];
  refunds: {
    id: string;
    receiptNo: number;
    amount: number;
    date: string;
    items: string;
  }[];
};

const TABS = [
  { id: "dayclose", label: "Day close" },
  { id: "tenders", label: "Tenders" },
  { id: "items", label: "Items & categories" },
  { id: "credit", label: "Credit & collections" },
  { id: "stock", label: "Stock" },
  { id: "purchases", label: "Purchases" },
  { id: "vat", label: "VAT & returns" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CAT_COLORS = [
  "#0f172a",
  "#10b981",
  "#64748b",
  "#f59e0b",
  "#ea580c",
  "#0ea5e9",
  "#94a3b8",
];
const MIX_COLORS: Record<string, string> = {
  Cash: "#64748b",
  "M-Pesa": "#10b981",
  "Credit account": "#f59e0b",
  "Card / bank": "#0ea5e9",
};

const CHART = {
  grid: "#eef0f4",
  tick: { fill: "#94a3b8", fontSize: 11 },
  accent: "#ea580c",
  brand: "#0f172a",
  profit: "#10b981",
  muted: "#cbd5e1",
  tooltip: {
    borderRadius: 12,
    border: "1px solid var(--sf-border)",
    fontSize: 12,
    background: "#fff",
    color: "var(--sf-brand)",
  },
} as const;

function tenderColor(label: string, index = 0) {
  return MIX_COLORS[label] || CAT_COLORS[index % CAT_COLORS.length];
}

function moneyTick(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return String(v);
}

const ghostBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sf-border)] bg-white px-2.5 text-xs font-medium text-[var(--sf-brand)] shadow-sm hover:bg-[var(--sf-surface-2)] disabled:opacity-50";
const primaryBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--sf-accent)] px-3 text-xs font-semibold text-white shadow-sm hover:bg-[var(--sf-accent-deep)] disabled:opacity-50";
const dateInput =
  "h-8 rounded-lg border-0 bg-white px-2.5 text-xs text-[var(--sf-brand)] ring-1 ring-inset ring-[var(--sf-border)] focus:ring-2 focus:ring-[var(--sf-accent)]";
const panel =
  "overflow-clip rounded-xl border border-[var(--sf-border)] bg-white shadow-sm";

type ExportFormat = "csv" | "excel" | "pdf";
type Row = Record<string, string | number | null | undefined>;

function tabExportMeta(tab: TabId): { title: string; base: string } {
  const map: Record<TabId, { title: string; base: string }> = {
    dayclose: { title: "Day close — sales", base: "day-close-sales" },
    tenders: { title: "Tenders", base: "tenders" },
    items: { title: "Items & categories", base: "items" },
    credit: { title: "Credit & collections", base: "collections" },
    stock: { title: "Stock status", base: "stock" },
    purchases: { title: "Purchases", base: "purchases" },
    vat: { title: "VAT & returns", base: "vat" },
  };
  return map[tab];
}

function buildExportRows(tab: TabId, data: Report): Row[] {
  switch (tab) {
    case "dayclose":
      return data.salesTable.map((r) => ({
        receipt: `#${r.receiptNo}`,
        date: r.date,
        customer: r.customer,
        cashier: r.cashier,
        items: r.items,
        tax: r.tax,
        total: r.total,
        profit: r.profit,
        payments: r.payments,
        status: r.status,
      }));
    case "tenders":
      return data.byPayment.map((p) => ({
        method: p.label,
        payments: p.count,
        amount: p.amount,
      }));
    case "items":
      return data.topItems.map((i) => ({
        item: i.name,
        sku: i.sku,
        qty: i.qty,
        revenue: i.revenue,
        cogs: i.cost,
        profit: i.profit,
      }));
    case "credit":
      return data.collections.map((c) => ({
        collection: `#${c.receiptNo}`,
        date: c.date,
        customer: c.customer,
        amount: c.amount,
        method: c.methodLabel,
        sale: c.saleReceiptNo != null ? `#${c.saleReceiptNo}` : "",
        type: c.isWriteOff ? "Write-off" : c.isStoreCreditReversal ? "Credit reverse" : "Payment",
        by: c.collectedBy,
      }));
    case "stock":
      return data.stockStatus.map((s) => ({
        item: s.name,
        sku: s.sku,
        category: s.category,
        onHand: s.qty,
        opened: s.openedQty,
        reorder: s.reorderLevel,
        costValue: s.stockValue,
        retailValue: s.retailValue,
        status: s.status,
      }));
    case "purchases":
      return data.purchases.map((p) => ({
        date: p.date,
        supplier: p.supplier,
        by: p.receivedBy,
        lines: p.lines,
        cost: p.totalCost,
        items: p.items,
      }));
    case "vat":
      return [
        {
          vatRate: data.vat.rate,
          pricesIncludeVat: data.vat.pricesIncludeVat ? "yes" : "no",
          salesGross: data.vat.salesGross,
          netExVat: data.vat.netExVat,
          vatCollected: data.vat.vatCollected,
          discounts: data.vat.discountTotal,
          refunds: data.vat.refundTotal,
          note: "Shop summary — not a filed KRA / eTIMS return",
        },
        ...data.refunds.map((r) => ({
          type: "refund",
          receipt: `#${r.receiptNo}`,
          date: r.date,
          items: r.items,
          amount: r.amount,
        })),
      ];
  }
}

function isTabId(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value);
}

function formatSaleStatus(status: string) {
  const labels: Record<string, string> = {
    COMPLETED: "Completed",
    PENDING: "Pending",
    CANCELLED: "Voided",
    VOIDED: "Voided",
    REFUNDED: "Refunded",
    PARTIALLY_REFUNDED: "Partially refunded",
  };
  return (
    labels[status] ||
    status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

function formatReportDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusTone(status: string) {
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-700";
  if (status === "REFUNDED" || status === "PARTIALLY_REFUNDED") return "bg-rose-50 text-rose-700";
  if (status === "CANCELLED" || status === "VOIDED") return "bg-slate-100 text-slate-600";
  if (status === "PENDING") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

const ACCENT_BAR: Record<string, string> = {
  brand: "from-[var(--sf-brand)]/80",
  emerald: "from-[#10b981]/80",
  sky: "from-[#0ea5e9]/80",
  amber: "from-[#f59e0b]/80",
  rose: "from-rose-500/80",
  orange: "from-[var(--sf-accent)]/80",
};

function MoneyLine({ amount, size = "md" }: { amount: number; size?: "sm" | "md" }) {
  const parts = formatMoneyParts(amount);
  const wholeCls = size === "sm" ? "text-sm" : "text-base sm:text-lg";
  const fracCls = size === "sm" ? "text-[10px]" : "text-xs";
  return (
    <p
      className={`truncate font-mono font-extrabold tracking-tight tabular-nums text-[var(--sf-brand)] ${wholeCls}`}
    >
      <span className="mr-1 font-sans text-[10px] font-medium text-slate-400">KSh</span>
      {parts.whole}
      <span className={`${fracCls} text-slate-400`}>.{parts.frac}</span>
    </p>
  );
}

/** Sales-style metric cell embedded inside a report panel (not a standalone card). */
function ReportMetric({
  label,
  value,
  note,
  accent = "brand",
  money,
}: {
  label: string;
  value?: string;
  note?: string;
  accent?: keyof typeof ACCENT_BAR;
  money?: number;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden border-b border-r border-slate-100 bg-white px-3.5 py-3 last:border-r-0 sm:px-4">
      <div
        className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${ACCENT_BAR[accent]} to-transparent`}
      />
      <p className="truncate pl-2 text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
        {label}
      </p>
      <div className="mt-1 min-w-0 pl-2">
        {money != null ? <MoneyLine amount={money} /> : (
          <p className="truncate font-mono text-base font-extrabold tabular-nums text-[var(--sf-brand)] sm:text-lg">
            {value}
          </p>
        )}
      </div>
      {note ? (
        <p className="mt-0.5 truncate pl-2 text-[10px] text-[var(--sf-muted)]">{note}</p>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent = "brand",
}: {
  label: string;
  value: string;
  accent?: keyof typeof ACCENT_BAR;
}) {
  return (
    <div className={`${panel} relative overflow-hidden`}>
      <div
        className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${ACCENT_BAR[accent]} to-transparent`}
      />
      <div className="px-4 py-3.5 sm:px-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sf-muted)]">
          {label}
        </p>
        <p className="mt-1 truncate font-mono text-lg font-extrabold tracking-tight tabular-nums text-[var(--sf-brand)] sm:text-xl">
          {value}
        </p>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${panel} ${className}`}>
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="sf-display text-[13px] font-bold text-[var(--sf-brand)]">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function TableCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={panel}>
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="sf-display text-[13px] font-bold text-[var(--sf-brand)]">{title}</h2>
      </div>
      <div className="p-3 sm:px-4 sm:pb-4">{children}</div>
    </section>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-[var(--sf-muted)]">Loading reports…</p>}>
      <ReportsInner />
    </Suspense>
  );
}

function ReportsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Report | null>(null);
  const [tab, setTab] = useState<TabId>("dayclose");
  const activeTab = isTabId(tabParam) ? tabParam : tab;
  const [loading, setLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRootRef = useRef<HTMLDivElement>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportPos = useFixedMenu(exportOpen, exportTriggerRef, {
    minSpace: 140,
    maxMenu: 220,
  });

  function selectTab(id: TabId) {
    setTab(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id === "dayclose") params.delete("tab");
    else params.set("tab", id);
    const qs = params.toString();
    router.replace(qs ? `/reports?${qs}` : "/reports");
  }

  function setRangePreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  }

  function activeRangeDays(): 1 | 7 | 30 | null {
    const end = new Date();
    const endIso = end.toISOString().slice(0, 10);
    if (to !== endIso) return null;
    for (const days of [1, 7, 30] as const) {
      const start = new Date();
      start.setDate(end.getDate() - (days - 1));
      if (from === start.toISOString().slice(0, 10)) return days;
    }
    return null;
  }

  const rangeDays = activeRangeDays();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const start = new Date(from);
      start.setHours(0, 0, 0, 0);
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      const params = new URLSearchParams({
        from: start.toISOString(),
        to: end.toISOString(),
      });
      try {
        const res = await fetch(`/api/reports/detailed?${params}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [from, to]);

  useEffect(() => {
    if (!exportOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (exportRootRef.current?.contains(t) || exportMenuRef.current?.contains(t)) return;
      setExportOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExportOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  function exportActive(format: ExportFormat) {
    if (!data) return;
    const rows = buildExportRows(activeTab, data);
    const meta = tabExportMeta(activeTab);
    const stamp = `${from}_to_${to}`;
    const subtitle = `${from} → ${to}`;
    if (format === "csv") downloadReportCsv(rows, `${meta.base}-${stamp}.csv`);
    else if (format === "excel")
      downloadReportExcel(rows, `${meta.base}-${stamp}.xls`, meta.title);
    else downloadReportPdf(meta.title, subtitle, rows, `${meta.base}-${stamp}.pdf`);
    setExportOpen(false);
  }

  const paymentTotal = data?.byPayment.reduce((sum, row) => sum + row.amount, 0) || 0;
  const dayMarginPct =
    data && data.salesTotal > 0 ? (data.profit / data.salesTotal) * 100 : 0;
  const dayAvgBasket =
    data && data.transactions > 0 ? data.salesTotal / data.transactions : 0;
  const dayCash = data?.byPayment.find((p) => p.method === "CASH")?.amount || 0;
  const dayMpesa = data?.byPayment.find((p) => p.method === "MPESA")?.amount || 0;
  const dayCard =
    data?.byPayment
      .filter((p) => p.method === "CARD" || p.method === "BANK")
      .reduce((s, p) => s + p.amount, 0) || 0;

  return (
    <div className="space-y-4">
      <section className={panel} aria-label="Report center overview">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <h1 className="sf-display truncate text-lg font-extrabold tracking-tight text-[var(--sf-brand)] sm:text-xl">
              Report center
            </h1>
            <p className="mt-0.5 text-xs text-[var(--sf-muted)]">
              Day close, tenders, credit, stock, purchases, and VAT for this branch
              {loading ? " · Updating…" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
                Range
              </p>
              <div
                role="group"
                aria-label="Quick date range"
                className="mt-1 inline-flex h-8 items-stretch rounded-lg border border-slate-200/70 bg-slate-100 p-0.5"
              >
                {(
                  [
                    { label: "Today", days: 1 as const },
                    { label: "7 days", days: 7 as const },
                    { label: "30 days", days: 30 as const },
                  ] as const
                ).map((p) => {
                  const on = rangeDays === p.days;
                  return (
                    <button
                      key={p.days}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setRangePreset(p.days)}
                      className={`rounded-md px-2.5 text-[11px] font-semibold transition ${
                        on
                          ? "bg-white text-[var(--sf-brand)] shadow-sm"
                          : "text-slate-600 hover:text-[var(--sf-brand)]"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
              From
              <input
                type="date"
                className={`${dateInput} mt-1 block`}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
              To
              <input
                type="date"
                className={`${dateInput} mt-1 block`}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <div ref={exportRootRef}>
              <button
                ref={exportTriggerRef}
                type="button"
                className={primaryBtn}
                disabled={!data || loading}
                aria-expanded={exportOpen}
                aria-haspopup="menu"
                onClick={() => setExportOpen((o) => !o)}
              >
                Export
                <svg className="size-3.5 opacity-90" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {exportOpen &&
                exportPos &&
                typeof document !== "undefined" &&
                createPortal(
                  <div
                    ref={exportMenuRef}
                    role="menu"
                    className="fixed z-[70] min-w-[11rem] overflow-hidden rounded-xl border border-[var(--sf-border)] bg-white py-1 shadow-lg ring-1 ring-black/5"
                    style={{
                      left: Math.max(
                        8,
                        exportPos.left + exportPos.width - 176
                      ),
                      width: 176,
                      maxHeight: exportPos.maxHeight,
                      top: exportPos.place === "below" ? exportPos.top : undefined,
                      bottom:
                        exportPos.place === "above"
                          ? window.innerHeight - exportPos.top
                          : undefined,
                    }}
                  >
                    {(
                      [
                        { id: "csv", label: "CSV (.csv)" },
                        { id: "excel", label: "Excel (.xls)" },
                        { id: "pdf", label: "PDF (.pdf)" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3 py-2 text-left text-xs font-medium text-[var(--sf-brand)] hover:bg-[var(--sf-surface-2)]"
                        onClick={() => exportActive(opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 px-4 py-2.5">
          <div
            role="tablist"
            aria-label="Report views"
            className="inline-flex max-w-full flex-wrap rounded-xl border border-slate-200/60 bg-slate-100 p-1"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                onClick={() => selectTab(t.id)}
                className={`h-7 rounded-lg px-2.5 text-xs font-semibold transition ${
                  activeTab === t.id
                    ? "bg-white text-[var(--sf-brand)] shadow-sm"
                    : "text-slate-600 hover:text-[var(--sf-brand)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!data ? (
        <p className="px-1 text-sm text-[var(--sf-muted)]">Loading reports…</p>
      ) : (
        <>
          {activeTab === "dayclose" && (
            <div className="space-y-4">
              <section className={panel} aria-label="Day close period summary">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                  <div className="min-w-0">
                    <h2 className="sf-display text-[13px] font-bold text-[var(--sf-brand)]">
                      Period summary
                    </h2>
                    <p className="mt-0.5 text-[11px] text-[var(--sf-muted)]">
                      {from} → {to} · sales, tenders, margin, and till links
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/cash/close-day" className={ghostBtn}>
                      Close day / till
                    </Link>
                    <Link href="/cash/drawer-sessions" className={ghostBtn}>
                      Drawer sessions &amp; Z-report
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
                  <ReportMetric label="Sales" money={data.salesTotal} accent="brand" />
                  <ReportMetric label="COGS" money={data.costTotal} accent="amber" />
                  <ReportMetric
                    label="Gross profit"
                    money={data.profit}
                    note={`${dayMarginPct.toFixed(1)}% margin`}
                    accent="emerald"
                  />
                  <ReportMetric
                    label="Avg basket"
                    money={dayAvgBasket}
                    note={`${data.transactions} txns`}
                    accent="orange"
                  />
                  <ReportMetric
                    label="VAT collected"
                    money={data.taxTotal}
                    note={
                      data.vat.rate > 0
                        ? `${data.vat.rate}% ${data.vat.pricesIncludeVat ? "incl." : "excl."}`
                        : "VAT off"
                    }
                    accent="sky"
                  />
                  <ReportMetric
                    label="Transactions"
                    value={String(data.transactions)}
                    note="Completed in period"
                    accent="brand"
                  />
                </div>

                <div className="grid grid-cols-2 border-t border-slate-100 sm:grid-cols-3 xl:grid-cols-6">
                  <ReportMetric label="Discounts" money={data.discountTotal} accent="amber" />
                  <ReportMetric label="Refunds" money={data.refundTotal} accent="rose" />
                  <ReportMetric
                    label="Credit sales"
                    money={data.creditSalesTotal}
                    note={`${data.creditTxnCount} credit txns`}
                    accent="amber"
                  />
                  <ReportMetric label="Cash" money={dayCash} accent="brand" />
                  <ReportMetric label="M-Pesa" money={dayMpesa} accent="emerald" />
                  <ReportMetric label="Card / bank" money={dayCard} accent="sky" />
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <ChartCard title="Daily sales trend">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={data.dailySales}
                        margin={{ top: 4, right: 6, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="sfReportSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.18} />
                            <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="sfReportProfit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART.profit} stopOpacity={0.14} />
                            <stop offset="100%" stopColor={CHART.profit} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={CHART.grid} vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={CHART.tick}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={CHART.tick}
                          axisLine={false}
                          tickLine={false}
                          width={40}
                          tickFormatter={moneyTick}
                        />
                        <Tooltip
                          contentStyle={CHART.tooltip}
                          formatter={(v) => formatKes(Number(v))}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 11, color: "var(--sf-muted)" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="sales"
                          stroke={CHART.accent}
                          fill="url(#sfReportSales)"
                          strokeWidth={2.2}
                          name="Sales"
                        />
                        <Area
                          type="monotone"
                          dataKey="profit"
                          stroke={CHART.profit}
                          fill="url(#sfReportProfit)"
                          strokeWidth={2}
                          name="Profit"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
                <TableCard title="By cashier">
                  <DataTable
                    embedded
                    rows={data.byCashier.map((c, i) => ({ ...c, id: String(i) }))}
                    columns={[
                      { key: "name", label: "Cashier" },
                      { key: "txns", label: "Txns", sortValue: (r) => r.txns },
                      {
                        key: "sales",
                        label: "Sales",
                        render: (r) => (
                          <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                            {formatKes(r.sales)}
                          </span>
                        ),
                        sortValue: (r) => r.sales,
                      },
                      {
                        key: "profit",
                        label: "Profit",
                        render: (r) => (
                          <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                            {formatKes(r.profit)}
                          </span>
                        ),
                        sortValue: (r) => r.profit,
                      },
                    ]}
                    empty="No cashier sales in this period"
                  />
                </TableCard>
              </div>

              <TableCard title="Sales detail">
                <DataTable
                  embedded
                  rows={data.salesTable}
                  searchKeys={["customer", "cashier", "receiptNo", "payments"]}
                  columns={[
                    {
                      key: "receiptNo",
                      label: "Receipt",
                      render: (r) => (
                        <span className="font-mono text-xs font-semibold">#{r.receiptNo}</span>
                      ),
                      sortValue: (r) => r.receiptNo,
                    },
                    {
                      key: "date",
                      label: "Date",
                      render: (r) => formatReportDate(r.date),
                      sortValue: (r) => r.date,
                    },
                    { key: "customer", label: "Customer" },
                    { key: "cashier", label: "Cashier" },
                    { key: "items", label: "Items", sortValue: (r) => r.items },
                    {
                      key: "total",
                      label: "Total",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.total)}
                        </span>
                      ),
                      sortValue: (r) => r.total,
                    },
                    {
                      key: "profit",
                      label: "Profit",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.profit)}
                        </span>
                      ),
                      sortValue: (r) => r.profit,
                    },
                    { key: "payments", label: "Pay" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r) => (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusTone(r.status)}`}
                        >
                          {formatSaleStatus(r.status)}
                        </span>
                      ),
                    },
                  ]}
                />
              </TableCard>
            </div>
          )}

          {activeTab === "tenders" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(["CASH", "MPESA", "CARD", "CREDIT"] as const).map((method) => {
                  const row = data.byPayment.find(
                    (p) => p.method === method || (method === "CARD" && p.method === "BANK")
                  );
                  const label =
                    method === "CASH"
                      ? "Cash"
                      : method === "MPESA"
                        ? "M-Pesa"
                        : method === "CARD"
                          ? "Card / bank"
                          : "Credit account";
                  const amount =
                    method === "CARD"
                      ? data.byPayment
                          .filter((p) => p.method === "CARD" || p.method === "BANK")
                          .reduce((s, p) => s + p.amount, 0)
                      : row?.amount || 0;
                  const count =
                    method === "CARD"
                      ? data.byPayment
                          .filter((p) => p.method === "CARD" || p.method === "BANK")
                          .reduce((s, p) => s + p.count, 0)
                      : row?.count || 0;
                  return (
                    <KpiCard
                      key={method}
                      label={`${label} · ${count} pay`}
                      value={formatKes(amount)}
                      accent={
                        method === "MPESA"
                          ? "emerald"
                          : method === "CARD"
                            ? "sky"
                            : method === "CREDIT"
                              ? "amber"
                              : "brand"
                      }
                    />
                  );
                })}
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <ChartCard title="Tender mix">
                  <div className="flex h-56 flex-col items-center gap-4 sm:flex-row sm:justify-center">
                    <div className="h-40 w-40 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.byPayment}
                            dataKey="amount"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            innerRadius={32}
                            outerRadius={64}
                            paddingAngle={1}
                            stroke="#fff"
                            strokeWidth={2}
                          >
                            {data.byPayment.map((row, i) => (
                              <Cell key={row.method} fill={tenderColor(row.label, i)} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={CHART.tooltip}
                            formatter={(v) => formatKes(Number(v))}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="space-y-2.5">
                      {data.byPayment.map((row, i) => {
                        const pct = paymentTotal
                          ? Math.round((row.amount / paymentTotal) * 100)
                          : 0;
                        return (
                          <li key={row.method} className="flex items-center gap-2 text-xs">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: tenderColor(row.label, i) }}
                            />
                            <span className="font-medium text-[var(--sf-muted)]">{row.label}</span>
                            <span className="font-semibold text-[var(--sf-brand)]">{pct}%</span>
                          </li>
                        );
                      })}
                      {data.byPayment.length === 0 && (
                        <li className="text-xs text-[var(--sf-muted)]">No tenders in this period</li>
                      )}
                    </ul>
                  </div>
                </ChartCard>
                <TableCard title="Tender breakdown">
                  <DataTable
                    embedded
                    rows={data.byPayment.map((p) => ({ ...p, id: p.method }))}
                    columns={[
                      { key: "label", label: "Method" },
                      { key: "count", label: "Payments", sortValue: (r) => r.count },
                      {
                        key: "amount",
                        label: "Amount",
                        render: (r) => (
                          <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                            {formatKes(r.amount)}
                          </span>
                        ),
                        sortValue: (r) => r.amount,
                      },
                    ]}
                    empty="No tender payments"
                  />
                </TableCard>
              </div>

              <TableCard title="M-Pesa receipts">
                <DataTable
                  embedded
                  rows={data.mpesaPayments}
                  searchKeys={["mpesaReceipt", "phone", "customer", "receiptNo"]}
                  columns={[
                    {
                      key: "receiptNo",
                      label: "Sale #",
                      render: (r) => (
                        <span className="font-mono text-xs font-semibold">#{r.receiptNo}</span>
                      ),
                      sortValue: (r) => r.receiptNo,
                    },
                    {
                      key: "date",
                      label: "Date",
                      render: (r) => formatReportDate(r.date),
                      sortValue: (r) => r.date,
                    },
                    { key: "customer", label: "Customer" },
                    {
                      key: "mpesaReceipt",
                      label: "M-Pesa ref",
                      render: (r) => (
                        <span className="font-mono text-xs">{r.mpesaReceipt || "—"}</span>
                      ),
                    },
                    { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
                    {
                      key: "amount",
                      label: "Amount",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.amount)}
                        </span>
                      ),
                      sortValue: (r) => r.amount,
                    },
                  ]}
                  empty="No M-Pesa payments in this period"
                />
              </TableCard>
            </div>
          )}

          {activeTab === "items" && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Top items by revenue">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.topItems.slice(0, 10)}
                        layout="vertical"
                        margin={{ left: 80, right: 8, top: 4, bottom: 0 }}
                      >
                        <CartesianGrid stroke={CHART.grid} horizontal={false} />
                        <XAxis
                          type="number"
                          tick={CHART.tick}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={moneyTick}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={80}
                          tick={{ ...CHART.tick, fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={CHART.tooltip}
                          formatter={(v) => formatKes(Number(v))}
                        />
                        <Bar dataKey="revenue" fill={CHART.accent} name="Revenue" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
                <ChartCard title="Sales by category">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.byCategory}
                        margin={{ top: 4, right: 6, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid stroke={CHART.grid} vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={CHART.tick}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={CHART.tick}
                          axisLine={false}
                          tickLine={false}
                          width={40}
                          tickFormatter={moneyTick}
                        />
                        <Tooltip
                          contentStyle={CHART.tooltip}
                          formatter={(v) => formatKes(Number(v))}
                        />
                        <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]}>
                          {data.byCategory.map((_, i) => (
                            <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>
              <TableCard title="Sales by item">
                <DataTable
                  embedded
                  rows={data.topItems.map((i, idx) => ({ ...i, id: i.sku || String(idx) }))}
                  searchKeys={["name", "sku"]}
                  columns={[
                    { key: "name", label: "Item" },
                    {
                      key: "sku",
                      label: "SKU",
                      render: (r) => <span className="font-mono text-xs">{r.sku}</span>,
                    },
                    { key: "qty", label: "Qty sold", sortValue: (r) => r.qty },
                    {
                      key: "revenue",
                      label: "Revenue",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.revenue)}
                        </span>
                      ),
                      sortValue: (r) => r.revenue,
                    },
                    {
                      key: "cost",
                      label: "COGS",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.cost)}
                        </span>
                      ),
                      sortValue: (r) => r.cost,
                    },
                    {
                      key: "profit",
                      label: "Profit",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.profit)}
                        </span>
                      ),
                      sortValue: (r) => r.profit,
                    },
                  ]}
                />
              </TableCard>
            </div>
          )}

          {activeTab === "credit" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label="Credit sales"
                  value={formatKes(data.creditSalesTotal)}
                  accent="amber"
                />
                <KpiCard label="Credit txns" value={String(data.creditTxnCount)} />
                <KpiCard
                  label="Collections (period)"
                  value={formatKes(data.collectionsTotal)}
                  accent="emerald"
                />
                <KpiCard
                  label="Open A/R"
                  value={formatKes(data.receivablesTotal)}
                  accent="rose"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Link href="/customers?filter=owing" className={ghostBtn}>
                  Collect in customers
                </Link>
                <Link href="/receivables" className={primaryBtn}>
                  Full aging ledger
                </Link>
              </div>

              <TableCard title="Collections in period">
                <DataTable
                  embedded
                  rows={data.collections}
                  searchKeys={["customer", "phone", "methodLabel", "receiptNo"]}
                  columns={[
                    {
                      key: "receiptNo",
                      label: "Coll. #",
                      render: (r) => (
                        <span className="font-mono text-xs font-semibold">#{r.receiptNo}</span>
                      ),
                      sortValue: (r) => r.receiptNo,
                    },
                    {
                      key: "date",
                      label: "Date",
                      render: (r) => formatReportDate(r.date),
                      sortValue: (r) => r.date,
                    },
                    { key: "customer", label: "Customer" },
                    {
                      key: "amount",
                      label: "Amount",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.amount)}
                        </span>
                      ),
                      sortValue: (r) => r.amount,
                    },
                    { key: "methodLabel", label: "Method" },
                    {
                      key: "saleReceiptNo",
                      label: "Sale #",
                      render: (r) =>
                        r.saleReceiptNo != null ? (
                          <span className="font-mono text-xs">#{r.saleReceiptNo}</span>
                        ) : (
                          "—"
                        ),
                    },
                    {
                      key: "isWriteOff",
                      label: "Type",
                      render: (r) =>
                        r.isWriteOff ? "Write-off" : r.isStoreCreditReversal ? "Credit reverse" : "Payment",
                    },
                    { key: "collectedBy", label: "By" },
                  ]}
                  empty="No customer collections in this period"
                />
              </TableCard>

              <TableCard title="Open receivables">
                <DataTable
                  embedded
                  rows={data.receivables}
                  searchKeys={["name", "phone"]}
                  columns={[
                    { key: "name", label: "Customer" },
                    { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
                    {
                      key: "balance",
                      label: "Balance",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.balance)}
                        </span>
                      ),
                      sortValue: (r) => r.balance,
                    },
                    {
                      key: "creditLimit",
                      label: "Limit",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.creditLimit)}
                        </span>
                      ),
                      sortValue: (r) => r.creditLimit,
                    },
                  ]}
                  empty="No open receivables"
                />
              </TableCard>
            </div>
          )}

          {activeTab === "stock" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <KpiCard label="Stock value (cost)" value={formatKes(data.inventoryValue)} />
                <KpiCard label="Retail value" value={formatKes(data.retailValue)} accent="emerald" />
                <KpiCard
                  label="Opened / quarantine"
                  value={formatKes(data.openedValue)}
                  accent="amber"
                />
              </div>
              {data.lowStockCount > 0 && (
                <p className="sf-alert sf-alert-warn">
                  {data.lowStockCount} item(s) at or below reorder / out of stock
                </p>
              )}
              <TableCard title="Inventory stock status">
                <DataTable
                  embedded
                  rows={data.stockStatus}
                  searchKeys={["name", "sku", "category", "status"]}
                  columns={[
                    { key: "name", label: "Item" },
                    {
                      key: "sku",
                      label: "SKU",
                      render: (r) => <span className="font-mono text-xs">{r.sku}</span>,
                    },
                    { key: "category", label: "Category" },
                    { key: "qty", label: "On hand", sortValue: (r) => r.qty },
                    { key: "openedQty", label: "Opened", sortValue: (r) => r.openedQty },
                    { key: "reorderLevel", label: "Reorder", sortValue: (r) => r.reorderLevel },
                    {
                      key: "stockValue",
                      label: "Cost value",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.stockValue)}
                        </span>
                      ),
                      sortValue: (r) => r.stockValue,
                    },
                    {
                      key: "retailValue",
                      label: "Retail value",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.retailValue)}
                        </span>
                      ),
                      sortValue: (r) => r.retailValue,
                    },
                    {
                      key: "status",
                      label: "Status",
                      render: (r) => (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                            r.status === "OK"
                              ? "bg-emerald-50 text-emerald-700"
                              : r.status === "Out"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {r.status}
                        </span>
                      ),
                    },
                  ]}
                />
              </TableCard>
            </div>
          )}

          {activeTab === "purchases" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <KpiCard
                  label="Purchases received"
                  value={formatKes(data.purchasesTotal)}
                  accent="sky"
                />
                <KpiCard label="Receipts" value={String(data.purchases.length)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/purchasing" className={ghostBtn}>
                  Open purchasing
                </Link>
              </div>
              <TableCard title="Supplier receipts in period">
                <DataTable
                  embedded
                  rows={data.purchases}
                  searchKeys={["supplier", "receivedBy", "items", "note"]}
                  columns={[
                    {
                      key: "date",
                      label: "Received",
                      render: (r) => formatReportDate(r.date),
                      sortValue: (r) => r.date,
                    },
                    { key: "supplier", label: "Supplier" },
                    { key: "receivedBy", label: "By" },
                    { key: "lines", label: "Lines", sortValue: (r) => r.lines },
                    {
                      key: "totalCost",
                      label: "Cost",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.totalCost)}
                        </span>
                      ),
                      sortValue: (r) => r.totalCost,
                    },
                    { key: "items", label: "Items" },
                  ]}
                  empty="No purchases received in this period"
                />
              </TableCard>
            </div>
          )}

          {activeTab === "vat" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="font-semibold">Shop VAT summary — not a filed KRA / eTIMS return</p>
                <p className="mt-1 text-xs text-amber-900/80">
                  Use this for internal checks and your accountant. Live eTIMS control numbers and
                  KRA filing are not included yet.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Gross sales" value={formatKes(data.vat.salesGross)} />
                <KpiCard
                  label={data.vat.pricesIncludeVat ? "Net ex-VAT (est.)" : "Net sales"}
                  value={formatKes(data.vat.netExVat)}
                  accent="sky"
                />
                <KpiCard
                  label={`VAT collected${data.vat.rate > 0 ? ` · ${data.vat.rate}%` : ""}`}
                  value={formatKes(data.vat.vatCollected)}
                  accent="emerald"
                />
                <KpiCard
                  label="Refunds approved"
                  value={formatKes(data.vat.refundTotal)}
                  accent="rose"
                />
              </div>

              <div className={`${panel} px-5 py-4 text-xs text-[var(--sf-muted)]`}>
                <p>
                  Pricing mode:{" "}
                  <span className="font-semibold text-[var(--sf-brand)]">
                    {data.vat.pricesIncludeVat ? "VAT-inclusive" : "VAT-exclusive"}
                  </span>
                  {data.vat.rate > 0
                    ? ` · configured rate ${data.vat.rate}%`
                    : " · VAT currently off in settings"}
                </p>
                <p className="mt-1">
                  Discounts in period:{" "}
                  <span className="font-mono font-medium text-[var(--sf-brand)]">
                    {formatKes(data.vat.discountTotal)}
                  </span>
                </p>
              </div>

              <TableCard title="Approved refunds">
                <DataTable
                  embedded
                  rows={data.refunds}
                  searchKeys={["items", "receiptNo"]}
                  columns={[
                    {
                      key: "receiptNo",
                      label: "Receipt",
                      render: (r) => (
                        <span className="font-mono text-xs font-semibold">#{r.receiptNo}</span>
                      ),
                      sortValue: (r) => r.receiptNo,
                    },
                    {
                      key: "date",
                      label: "Date",
                      render: (r) => formatReportDate(r.date),
                      sortValue: (r) => r.date,
                    },
                    { key: "items", label: "Items" },
                    {
                      key: "amount",
                      label: "Amount",
                      render: (r) => (
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                          {formatKes(r.amount)}
                        </span>
                      ),
                      sortValue: (r) => r.amount,
                    },
                  ]}
                  empty="No refunds in this period"
                />
              </TableCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}
