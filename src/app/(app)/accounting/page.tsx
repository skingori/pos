"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatKesAmount, formatMoneyParts } from "@/lib/money";
import {
  downloadReportCsv,
  downloadReportExcel,
  downloadReportPdf,
} from "@/lib/report-export";
import { CODES } from "@/lib/gl-codes";
import { useFixedMenu } from "@/components/ui/use-fixed-menu";

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
};

type Entry = {
  id: string;
  date: string;
  memo: string;
  sourceType: string;
  sourceId?: string | null;
  lines: {
    debit: number;
    credit: number;
    account: { code: string; name: string; type?: string };
  }[];
};

type QuickFilter = "all" | "sales" | "purchases" | "cash" | "adjustments";
type ExportFormat = "csv" | "excel" | "pdf";

const LIQUID = new Set([CODES.CASH, CODES.MPESA, CODES.CARD, CODES.BANK]);

const SALE_SOURCES = new Set(["Sale", "SaleVoid", "Refund", "CustomerPayment"]);
const PURCHASE_SOURCES = new Set(["Purchase"]);
const CASH_SOURCES = new Set(["CashMovement", "PosSession"]);
const ADJUST_SOURCES = new Set(["WriteOff"]);

const ghostBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const primaryBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--sf-accent)] px-3 text-xs font-semibold text-white shadow-sm hover:bg-[var(--sf-accent-deep)] disabled:opacity-50";
const panel =
  "overflow-hidden rounded-xl border border-[var(--sf-border)] bg-white shadow-sm";
const dateInput =
  "h-8 rounded-lg border-0 bg-white px-2.5 text-xs text-[var(--sf-brand)] ring-1 ring-inset ring-[var(--sf-border)] focus:ring-2 focus:ring-[var(--sf-accent)]";

function isoDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function rangeStart(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return isoDay(start);
}

function displayBalance(a: Account) {
  if (a.type === "LIABILITY" || a.type === "EQUITY" || a.type === "INCOME") {
    return a.credit - a.debit;
  }
  return a.debit - a.credit;
}

function entryTotals(e: Entry) {
  return e.lines.reduce(
    (acc, l) => ({
      debit: acc.debit + (l.debit || 0),
      credit: acc.credit + (l.credit || 0),
    }),
    { debit: 0, credit: 0 }
  );
}

function sourceTone(sourceType: string) {
  if (SALE_SOURCES.has(sourceType)) {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }
  if (PURCHASE_SOURCES.has(sourceType)) {
    return "bg-sky-50 text-sky-800 ring-sky-200";
  }
  if (CASH_SOURCES.has(sourceType)) {
    return "bg-amber-50 text-amber-900 ring-amber-200";
  }
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function sourceLabel(sourceType: string) {
  if (sourceType === "CashMovement" || sourceType === "PosSession") return "Cash";
  if (sourceType === "CustomerPayment") return "Payment";
  if (sourceType === "SaleVoid") return "Void";
  if (sourceType === "WriteOff") return "Adjust";
  return sourceType;
}

function matchesQuick(sourceType: string, quick: QuickFilter) {
  if (quick === "all") return true;
  if (quick === "sales") return SALE_SOURCES.has(sourceType);
  if (quick === "purchases") return PURCHASE_SOURCES.has(sourceType);
  if (quick === "cash") return CASH_SOURCES.has(sourceType);
  return ADJUST_SOURCES.has(sourceType) || (!SALE_SOURCES.has(sourceType) && !PURCHASE_SOURCES.has(sourceType) && !CASH_SOURCES.has(sourceType));
}

export default function AccountingPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => rangeStart(30));
  const [to, setTo] = useState(() => isoDay());
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRootRef = useRef<HTMLDivElement>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportPos = useFixedMenu(exportOpen, exportTriggerRef, {
    minSpace: 140,
    maxMenu: 220,
  });

  function setRangePreset(days: 1 | 7 | 30) {
    setFrom(rangeStart(days));
    setTo(isoDay());
  }

  function activeRangeDays(): 1 | 7 | 30 | null {
    if (to !== isoDay()) return null;
    for (const days of [1, 7, 30] as const) {
      const start = new Date();
      start.setDate(start.getDate() - (days - 1));
      if (from === isoDay(start)) return days;
    }
    return null;
  }

  const rangeDays = activeRangeDays();

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", `${to}T23:59:59.999`);
    const data = await fetch(`/api/journals?${params}`).then((r) => r.json());
    setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    setEntries(Array.isArray(data.entries) ? data.entries : []);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load();
    }, 200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    setPage(1);
    setExpanded(null);
  }, [q, quick, sourceFilter, from, to, pageSize]);

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

  const sources = useMemo(() => {
    const set = new Set(entries.map((e) => e.sourceType));
    return [...set].sort();
  }, [entries]);

  const kpis = useMemo(() => {
    const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));
    const bal = (code: string) => {
      const a = byCode[code];
      return a ? displayBalance(a) : 0;
    };
    const cash = [...LIQUID].reduce((s, code) => s + bal(code), 0);
    const payables = accounts
      .filter((a) => a.type === "LIABILITY")
      .reduce((s, a) => s + displayBalance(a), 0);
    const income = accounts
      .filter((a) => a.type === "INCOME")
      .reduce((s, a) => s + displayBalance(a), 0);
    const costs = accounts
      .filter((a) => a.type === "COGS" || a.type === "EXPENSE")
      .reduce((s, a) => s + displayBalance(a), 0);
    return {
      cash,
      ar: bal(CODES.AR),
      payables,
      pnl: income - costs,
    };
  }, [accounts]);

  const counts = useMemo(() => {
    const base = { all: 0, sales: 0, purchases: 0, cash: 0, adjustments: 0 };
    for (const e of entries) {
      base.all += 1;
      if (SALE_SOURCES.has(e.sourceType)) base.sales += 1;
      else if (PURCHASE_SOURCES.has(e.sourceType)) base.purchases += 1;
      else if (CASH_SOURCES.has(e.sourceType)) base.cash += 1;
      else base.adjustments += 1;
    }
    return base;
  }, [entries]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (sourceFilter !== "all" && e.sourceType !== sourceFilter) return false;
      if (!matchesQuick(e.sourceType, quick)) return false;
      if (!needle) return true;
      const hay = [
        e.memo,
        e.sourceType,
        e.sourceId || "",
        ...e.lines.map((l) => `${l.account.code} ${l.account.name}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [entries, q, quick, sourceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(safePage * pageSize, filtered.length);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const chartSnapshot = useMemo(() => {
    const preferred = [
      CODES.CASH,
      CODES.MPESA,
      CODES.AR,
      CODES.INVENTORY,
      CODES.VAT,
      CODES.SALES,
      CODES.COGS,
    ];
    const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));
    const list = preferred.map((code) => byCode[code]).filter(Boolean) as Account[];
    if (list.length) return list;
    return accounts.slice(0, 7);
  }, [accounts]);

  function exportJournals(format: ExportFormat) {
    const rows = filtered.map((e) => {
      const t = entryTotals(e);
      return {
        Date: new Date(e.date).toISOString(),
        Memo: e.memo,
        Source: e.sourceType,
        Debit: t.debit,
        Credit: t.credit,
      };
    });
    const stamp = `${from}_to_${to}`;
    const title = "Books & journals";
    const subtitle = `${from} → ${to} · ${filtered.length} entries`;
    if (format === "csv") downloadReportCsv(rows, `journals-${stamp}.csv`);
    else if (format === "excel") downloadReportExcel(rows, `journals-${stamp}.xls`, title);
    else downloadReportPdf(title, subtitle, rows, `journals-${stamp}.pdf`);
    setExportOpen(false);
  }

  const periodNote =
    from && to
      ? `${new Date(from).toLocaleDateString("en-KE", { month: "short", day: "numeric" })} – ${new Date(to).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}`
      : "Selected period";

  const cashParts = formatMoneyParts(kpis.cash);
  const arParts = formatMoneyParts(kpis.ar);
  const payParts = formatMoneyParts(kpis.payables);
  const pnlParts = formatMoneyParts(kpis.pnl);

  return (
    <div className="space-y-4">
      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-[var(--sf-border)]"
        aria-label="Books overview"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h1 className="sf-display truncate text-base font-extrabold tracking-tight text-[var(--sf-brand)] sm:text-lg">
              Books & journals
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[var(--sf-muted)]">{periodNote}</span>
              <span className="rounded-full bg-[var(--sf-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--sf-accent-deep)] ring-1 ring-inset ring-[var(--sf-accent)]/20">
                Double-entry
              </span>
              {kpis.ar > 0 && (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  Credit owing
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 border-t border-slate-200 lg:grid-cols-4 lg:divide-y-0">
          <div className="flex flex-col px-3 py-2.5 sm:px-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Cash on hand
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-[var(--sf-brand)] sm:text-lg">
                {cashParts.whole}
                <span className="text-sm text-slate-400">.{cashParts.frac}</span>
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Cash + M-Pesa + card + bank</p>
          </div>

          <div className="flex flex-col px-3 py-2.5 sm:px-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Receivables
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-amber-700 sm:text-lg">
                {arParts.whole}
                <span className="text-sm text-amber-400">.{arParts.frac}</span>
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Customer balances owing</p>
            {kpis.ar > 0 && (
              <Link
                href="/customers?filter=owing"
                className="mt-1.5 self-start text-[11px] font-medium text-[var(--sf-accent)] hover:underline"
              >
                Collect →
              </Link>
            )}
          </div>

          <div className="flex flex-col px-3 py-2.5 sm:px-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Payables
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-rose-700 sm:text-lg">
                {payParts.whole}
                <span className="text-sm text-rose-400">.{payParts.frac}</span>
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">VAT & other liabilities</p>
          </div>

          <a
            href="#trial-balance"
            className="flex flex-col px-3 py-2.5 text-left hover:bg-slate-50 sm:px-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Period P&L
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span
                className={`font-mono text-base font-bold tracking-tight sm:text-lg ${
                  kpis.pnl >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {pnlParts.whole}
                <span className={kpis.pnl >= 0 ? "text-sm text-emerald-400" : "text-sm text-rose-400"}>
                  .{pnlParts.frac}
                </span>
              </span>
              <span
                className={`rounded px-1 py-0.5 text-[10px] font-medium ${
                  kpis.pnl >= 0
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {kpis.pnl >= 0 ? "profit" : "loss"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{periodNote}</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-[var(--sf-accent)]">
              Trial balance →
            </span>
          </a>
        </div>
      </section>

      <section className={`${panel} p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[14rem] flex-1">
            <svg
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="9" cy="9" r="6" />
              <path d="M14 14l4 4" />
            </svg>
            <input
              type="search"
              className="h-8 w-full rounded-lg border-0 bg-white py-0 pr-3 pl-9 text-xs text-[var(--sf-brand)] ring-1 ring-inset ring-[var(--sf-border)] placeholder:text-slate-400 focus:ring-2 focus:ring-[var(--sf-accent)]"
              placeholder="Search memo, account, or source…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className="h-8 rounded-lg border-0 bg-white px-2.5 text-xs font-medium text-[var(--sf-brand)] ring-1 ring-inset ring-[var(--sf-border)] focus:ring-2 focus:ring-[var(--sf-accent)]"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="all">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div>
            <p className="text-[10px] font-semibold tracking-wide text-[var(--sf-muted)] uppercase">
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
          <label className="text-[10px] font-semibold tracking-wide text-[var(--sf-muted)] uppercase">
            From
            <input
              type="date"
              className={`${dateInput} mt-1 block`}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-[10px] font-semibold tracking-wide text-[var(--sf-muted)] uppercase">
            To
            <input
              type="date"
              className={`${dateInput} mt-1 block`}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <div ref={exportRootRef} className="pb-0.5">
            <p className="text-[10px] font-semibold tracking-wide text-transparent uppercase">
              Export
            </p>
            <button
              ref={exportTriggerRef}
              type="button"
              className={`${primaryBtn} mt-1`}
              disabled={loading || !filtered.length}
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
                    left: Math.max(8, exportPos.left + exportPos.width - 176),
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
                      { id: "csv" as const, label: "CSV (.csv)" },
                      { id: "excel" as const, label: "Excel (.xls)" },
                      { id: "pdf" as const, label: "PDF (.pdf)" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitem"
                      className="flex w-full px-3 py-2 text-left text-xs font-medium text-[var(--sf-brand)] hover:bg-[var(--sf-surface-2)]"
                      onClick={() => exportJournals(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>,
                document.body
              )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
            Quick
          </span>
          {(
            [
              { id: "all" as const, label: `All (${counts.all})` },
              { id: "sales" as const, label: `Sales (${counts.sales})` },
              { id: "purchases" as const, label: `Purchases (${counts.purchases})` },
              { id: "cash" as const, label: `Cash moves (${counts.cash})` },
              { id: "adjustments" as const, label: `Adjustments (${counts.adjustments})` },
            ] as const
          ).map((c) => {
            const on = quick === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                  on
                    ? "bg-[var(--sf-brand)] text-white"
                    : "border border-[var(--sf-border)] bg-[var(--sf-surface-2)] text-[var(--sf-brand)] hover:bg-white"
                }`}
                onClick={() => setQuick(c.id)}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className={panel} aria-label="Ledger">
        <header className="border-b border-slate-100 px-5 py-3">
          <h2 className="sf-display text-[13px] font-bold text-[var(--sf-brand)]">Ledger</h2>
          <p className="mt-0.5 text-[11px] text-[var(--sf-muted)]">
            Account balances and journal activity for the selected period
          </p>
        </header>

        <div className="grid grid-cols-2 border-b border-slate-100 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {chartSnapshot.map((a) => (
            <div
              key={a.id}
              className="relative min-w-0 border-b border-r border-slate-100 px-3.5 py-2.5 last:border-r-0"
            >
              <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-[var(--sf-brand)]/70 to-transparent" />
              <p className="truncate pl-2 font-mono text-[10px] font-bold text-[var(--sf-muted)]">
                {a.code}
              </p>
              <p className="truncate pl-2 text-[11px] font-semibold text-[var(--sf-brand)]">{a.name}</p>
              <p className="mt-0.5 truncate pl-2 font-mono text-sm font-extrabold tabular-nums text-[var(--sf-brand)]">
                {formatKesAmount(displayBalance(a))}
              </p>
            </div>
          ))}
          {!chartSnapshot.length ? (
            <div className="col-span-full px-5 py-6 text-center text-xs text-[var(--sf-muted)]">
              No account balances yet
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-2.5">
          <p className="text-[11px] font-semibold text-[var(--sf-muted)]">
            Journal activity · newest first
          </p>
          <span className="text-xs font-semibold text-[var(--sf-muted)]">
            {filtered.length} entries
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-[var(--sf-surface-2)]/80 text-left text-[10px] font-bold tracking-wider text-[var(--sf-muted)] uppercase">
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3">Memo</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3 text-end">Debit</th>
                <th className="px-5 py-3 text-end">Credit</th>
                <th className="px-5 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-[var(--sf-muted)]">
                    Loading journals…
                  </td>
                </tr>
              ) : !paged.length ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-[var(--sf-muted)]">
                    No journals match this filter. Sales and purchases post here automatically.
                  </td>
                </tr>
              ) : (
                paged.map((e, i) => {
                  const t = entryTotals(e);
                  const open = expanded === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr
                        className={`border-b border-slate-50 text-[var(--sf-brand)] ${
                          open
                            ? "bg-[var(--sf-accent-soft)]/40"
                            : i % 2 === 1
                              ? "bg-[var(--sf-surface-2)]/35"
                              : "bg-white"
                        }`}
                      >
                        <td className="px-5 py-3 text-[11px] whitespace-nowrap text-[var(--sf-muted)]">
                          {new Date(e.date).toLocaleString(undefined, {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="max-w-[16rem] truncate px-5 py-3 text-xs font-semibold">
                          {e.memo}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${sourceTone(e.sourceType)}`}
                          >
                            {sourceLabel(e.sourceType)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-end font-mono text-xs font-bold tabular-nums">
                          {formatKesAmount(t.debit)}
                        </td>
                        <td className="px-5 py-3 text-end font-mono text-xs font-bold tabular-nums text-[var(--sf-muted)]">
                          {formatKesAmount(t.credit)}
                        </td>
                        <td className="px-5 py-3 text-end">
                          <button
                            type="button"
                            title={open ? "Hide detail" : "View detail"}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => setExpanded(open ? null : e.id)}
                          >
                            <svg
                              className="size-3.5 shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden
                            >
                              {open ? (
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                />
                              ) : (
                                <>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </>
                              )}
                            </svg>
                            {open ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b border-slate-100 bg-slate-50/80">
                          <td colSpan={6} className="px-5 py-3">
                            <div className="rounded-lg border border-[var(--sf-border)] bg-white p-3">
                              <p className="text-[10px] font-bold tracking-wider text-[var(--sf-muted)] uppercase">
                                Entry lines
                              </p>
                              <table className="mt-2 w-full text-xs">
                                <tbody>
                                  {e.lines.map((l, li) => (
                                    <tr key={li} className="border-t border-slate-50 first:border-0">
                                      <td className="py-1.5 font-mono text-[var(--sf-muted)]">
                                        {l.account.code}
                                      </td>
                                      <td className="py-1.5 font-medium text-[var(--sf-brand)]">
                                        {l.account.name}
                                      </td>
                                      <td className="py-1.5 text-end font-mono tabular-nums">
                                        {l.debit > 0 ? formatKesAmount(l.debit) : ""}
                                      </td>
                                      <td className="py-1.5 text-end font-mono tabular-nums text-[var(--sf-muted)]">
                                        {l.credit > 0 ? formatKesAmount(l.credit) : ""}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--sf-border)] px-4 py-3 text-sm text-[var(--sf-muted)] sm:px-5">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {filtered.length
                ? `Showing ${pageStart} – ${pageEnd} of ${filtered.length}`
                : "Showing 0 of 0"}
            </span>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="sr-only">Rows per page</span>
              <select
                className="h-8 rounded-lg border border-[var(--sf-border)] bg-white px-2.5 text-xs font-medium text-[var(--sf-brand)] outline-none focus:border-[var(--sf-accent)] focus:ring-1 focus:ring-[var(--sf-accent)]"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={ghostBtn}
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={ghostBtn}
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section id="trial-balance" className={panel} aria-label="Trial balance">
        <header className="border-b border-slate-100 px-5 py-3">
          <h2 className="sf-display text-[13px] font-bold text-[var(--sf-brand)]">Trial balance</h2>
          <p className="mt-0.5 text-[11px] text-[var(--sf-muted)]">
            Debits and credits by account for the selected period
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-[var(--sf-surface-2)]/80 text-left text-[10px] font-bold tracking-wider text-[var(--sf-muted)] uppercase">
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Account</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3 text-end">Debit</th>
                <th className="px-5 py-3 text-end">Credit</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a, i) => (
                <tr
                  key={a.id}
                  className={`border-b border-slate-50 ${
                    i % 2 === 1 ? "bg-[var(--sf-surface-2)]/35" : "bg-white"
                  }`}
                >
                  <td className="px-5 py-2.5 font-mono text-xs font-semibold text-[var(--sf-brand)]">
                    {a.code}
                  </td>
                  <td className="px-5 py-2.5 text-xs font-medium text-[var(--sf-brand)]">{a.name}</td>
                  <td className="px-5 py-2.5 text-xs text-[var(--sf-muted)]">{a.type}</td>
                  <td className="px-5 py-2.5 text-end font-mono text-xs tabular-nums">
                    {a.debit ? formatKesAmount(a.debit) : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-end font-mono text-xs tabular-nums text-[var(--sf-muted)]">
                    {a.credit ? formatKesAmount(a.credit) : "—"}
                  </td>
                </tr>
              ))}
              {!accounts.length ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-[var(--sf-muted)]">
                    No accounts in this period
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
