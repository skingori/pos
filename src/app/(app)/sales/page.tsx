"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatKes, marginPercent } from "@/lib/money";

type Sale = {
  id: string;
  receiptNo: number;
  total: number;
  costTotal: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
  customer: { name: string } | null;
  cashier: { name: string };
  payments: { method: string; amount: number; mpesaReceipt?: string | null }[];
  lines: { name: string; qty: number; lineTotal: number }[];
};

type DatePreset = "today" | "7d" | "week" | "month" | "last_month" | "custom";
type FocusStat = "revenue" | "cogs" | "gross" | "margin";

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function rangeFor(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = ymd(now);
  if (preset === "today") return { from: today, to: today };
  if (preset === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: ymd(d), to: today };
  }
  if (preset === "week") return { from: ymd(startOfWeek(now)), to: today };
  if (preset === "month") {
    return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
  if (preset === "last_month") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: ymd(first), to: ymd(last) };
  }
  return { from: today, to: today };
}

function shortKes(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `KSh ${(n / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `KSh ${(n / 1_000).toFixed(1)}k`;
  return formatKes(n);
}

function formatSaleWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} · ${time}`;
}

function paymentTone(methods: string) {
  const upper = methods.toUpperCase();
  if (upper.includes("CREDIT")) return "bg-[#fff0f2] text-[#e01c47]";
  if (upper.includes("MPESA")) return "bg-indigo-50 text-indigo-700";
  return "bg-emerald-50 text-emerald-700";
}

function periodLabel(preset: DatePreset, from: string, to: string) {
  if (preset === "today") return "today";
  if (preset === "7d") return "last 7 days";
  if (preset === "week") return "this week";
  if (preset === "month") return "this month";
  if (preset === "last_month") return "last month";
  if (!from || !to) return "selected range";
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "selected range";
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return a.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }
  return `${from} → ${to}`;
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<DatePreset>("month");
  const [from, setFrom] = useState(() => rangeFor("month").from);
  const [to, setTo] = useState(() => rangeFor("month").to);
  const [method, setMethod] = useState("");
  const [credit, setCredit] = useState("all");
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [focusStat, setFocusStat] = useState<FocusStat>("revenue");
  const [branchName, setBranchName] = useState("branch");

  function applyPreset(next: DatePreset) {
    setPreset(next);
    if (next === "custom") return;
    const range = rangeFor(next);
    setFrom(range.from);
    setTo(range.to);
  }

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (method) params.set("method", method);
    if (credit && credit !== "all") params.set("credit", credit);
    if (q.trim()) params.set("q", q.trim());
    params.set("take", "500");
    const list = await fetch(`/api/sales?${params}`).then((r) => r.json());
    setSales(Array.isArray(list) ? list : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, method, credit, q]);

  useEffect(() => {
    setPage(1);
  }, [from, to, method, credit, q, pageSize]);

  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.json())
      .then((list) => {
        if (!Array.isArray(list) || !list.length) return;
        const main = list.find((b: { code?: string; name?: string }) => b.code === "MAIN") || list[0];
        if (main?.name) setBranchName(main.name);
      })
      .catch(() => undefined);
  }, []);

  const summary = useMemo(() => {
    const revenue = sales.reduce((s, r) => s + r.total, 0);
    const cogs = sales.reduce((s, r) => s + (r.costTotal || 0), 0);
    const gross = revenue - cogs;
    const margin = marginPercent(cogs, revenue);
    const creditCount = sales.filter((s) =>
      s.payments.some((p) => p.method === "CREDIT")
    ).length;
    return { revenue, cogs, gross, margin, creditCount };
  }, [sales]);

  const pageCount = Math.max(1, Math.ceil(sales.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = sales.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(safePage * pageSize, sales.length);
  const paged = sales.slice((safePage - 1) * pageSize, safePage * pageSize);

  const presets: { id: DatePreset; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "7d", label: "Last 7 days" },
    { id: "week", label: "This week" },
    { id: "month", label: "This month" },
    { id: "last_month", label: "Last month" },
  ];

  const ghostBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50";
  const primaryBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50";
  const filterCtrl =
    "h-8 min-w-[7.5rem] appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900";

  const period = periodLabel(preset, from, to);

  return (
    <div className="space-y-4 [font-variant-numeric:tabular-nums]">
      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
        aria-label="Sales overview"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              Sales
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">
                Completed sales at {branchName} · {period}
              </span>
              {summary.creditCount > 0 ? (
                <button
                  type="button"
                  className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20 hover:bg-rose-100"
                  onClick={() => {
                    setCredit("credit");
                    setFocusStat("revenue");
                  }}
                >
                  {summary.creditCount} credit sale{summary.creditCount === 1 ? "" : "s"}
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href="/receipts" className={ghostBtn}>
              Open receipts
            </Link>
            <Link href="/pos" className={primaryBtn}>
              + New sale
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 border-t border-slate-200 lg:grid-cols-4 lg:divide-y-0">
          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "revenue" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setFocusStat("revenue");
              setCredit("all");
              setMethod("");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Revenue
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {shortKes(summary.revenue)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {sales.length} receipt{sales.length === 1 ? "" : "s"} · {period}
            </p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              View all →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "cogs" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => setFocusStat("cogs")}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">COGS</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-amber-600 sm:text-lg">
                {shortKes(summary.cogs)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Cost of goods sold</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              See COGS →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "gross" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => setFocusStat("gross")}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Gross profit
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-emerald-700 sm:text-lg">
                {shortKes(summary.gross)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Revenue − COGS</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Profit trend →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "margin" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => setFocusStat("margin")}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Gross margin
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-indigo-700 sm:text-lg">
                {summary.margin.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {summary.margin >= 30 ? "Healthy margin" : "Review pricing / COGS"}
            </p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Margin detail →
            </span>
          </button>
        </div>
      </section>

      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
        aria-label="Sales history"
      >
        <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5 sm:px-4">
          <div
            role="tablist"
            aria-label="Date range"
            className="inline-flex flex-wrap rounded-lg bg-indigo-50 p-0.5"
          >
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={preset === p.id}
                className={`h-7 rounded-md px-2.5 text-[11px] transition ${
                  preset === p.id
                    ? "bg-indigo-600 font-semibold text-white shadow-sm"
                    : "font-medium text-slate-700 hover:text-slate-900"
                }`}
                onClick={() => applyPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
          <label className="relative min-w-[160px] flex-1 sm:max-w-xs">
            <span className="sr-only">Search sales</span>
            <input
              type="search"
              placeholder="Search receipt, M-Pesa, product…"
              className="h-8 w-full rounded-lg border-0 bg-white px-2.5 text-[11px] ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <input
            type="date"
            aria-label="From date"
            className={filterCtrl}
            value={from}
            onChange={(e) => {
              setPreset("custom");
              setFrom(e.target.value);
            }}
          />
          <input
            type="date"
            aria-label="To date"
            className={filterCtrl}
            value={to}
            onChange={(e) => {
              setPreset("custom");
              setTo(e.target.value);
            }}
          />
          <select
            className={filterCtrl}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            aria-label="Payment method"
          >
            <option value="">All methods</option>
            <option value="CASH">Cash</option>
            <option value="MPESA">M-Pesa</option>
            <option value="CREDIT">Credit</option>
          </select>
          <select
            className={filterCtrl}
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
            aria-label="Credit status"
          >
            <option value="all">All sales</option>
            <option value="credit">Credit sales</option>
            <option value="paid">Paid in full</option>
          </select>
          <span className="ms-auto text-[11px] text-slate-500">
            {sales.length} receipt{sales.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Loading sales…</p>
        ) : !paged.length ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No sales for the current filters. Try a different date range, payment method, or search
            term.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50/80 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5 sm:px-4">Receipt</th>
                  <th className="px-3 py-2.5 sm:px-4">Date</th>
                  <th className="px-3 py-2.5 sm:px-4">Customer</th>
                  <th className="px-3 py-2.5 sm:px-4">Cashier</th>
                  <th className="px-3 py-2.5 sm:px-4">Payment</th>
                  <th className="px-3 py-2.5 text-right sm:px-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((s) => {
                  const methods = s.payments.map((p) => p.method).join(" · ") || "—";
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-3 py-3 text-xs font-semibold text-slate-900 sm:px-4">
                        #{s.receiptNo}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 sm:px-4">
                        {formatSaleWhen(s.completedAt || s.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-xs font-medium text-slate-900 sm:px-4">
                        {s.customer?.name || "Walk-in"}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 sm:px-4">{s.cashier.name}</td>
                      <td className="px-3 py-3 sm:px-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${paymentTone(methods)}`}
                        >
                          {methods}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-semibold tabular-nums text-slate-900 sm:px-4">
                        {formatKes(s.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5 text-xs text-slate-500 sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {sales.length
                ? `Showing ${pageStart} – ${pageEnd} of ${sales.length}`
                : "Showing 0 of 0"}
            </span>
            <select
              className="h-8 appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Per page"
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
          <div className="flex gap-1.5">
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
    </div>
  );
}
