"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatKes, marginPercent } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";

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

  const summary = useMemo(() => {
    const revenue = sales.reduce((s, r) => s + r.total, 0);
    const cogs = sales.reduce((s, r) => s + (r.costTotal || 0), 0);
    const gross = revenue - cogs;
    const margin = marginPercent(cogs, revenue);
    return { revenue, cogs, gross, margin };
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales"
        description="View and filter sales by period and payment method"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/receipts" className="sf-btn sf-btn-ghost">
              Open receipts
            </Link>
            <Link href="/pos" className="sf-btn sf-btn-primary">
              New sale
            </Link>
          </div>
        }
      />

      <div className="sf-card overflow-hidden p-0">
        <div className="border-b border-slate-100 px-4 pt-4 pb-3">
          <h3 className="text-base font-semibold text-[var(--sf-brand)]">Sales history</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            View and filter sales by period and payment method. Sort and paginate results.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`sf-btn ${preset === p.id ? "sf-btn-accent" : "sf-btn-ghost"}`}
                onClick={() => applyPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-slate-500">
              From
              <input
                type="date"
                className="sf-input mt-1"
                value={from}
                onChange={(e) => {
                  setPreset("custom");
                  setFrom(e.target.value);
                }}
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              To
              <input
                type="date"
                className="sf-input mt-1"
                value={to}
                onChange={(e) => {
                  setPreset("custom");
                  setTo(e.target.value);
                }}
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Payment method
              <select
                className="sf-select mt-1"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="">All methods</option>
                <option value="CASH">Cash</option>
                <option value="MPESA">M-Pesa</option>
                <option value="CREDIT">Credit</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Credit status
              <select
                className="sf-select mt-1"
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
              >
                <option value="all">All sales</option>
                <option value="credit">Credit sales</option>
                <option value="paid">Paid in full (no credit)</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500 sm:col-span-2">
              Search
              <input
                className="sf-input mt-1"
                placeholder="Reference, M-Pesa code, or product"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Per page
              <select
                className="sf-select mt-1"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-4">
          <div className="sf-stat rounded-xl border border-slate-100 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Revenue
            </div>
            <div className="mt-1 text-xl font-semibold text-[var(--sf-brand)]">
              {formatKes(summary.revenue)}
            </div>
          </div>
          <div className="sf-stat rounded-xl border border-slate-100 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              COGS
            </div>
            <div className="mt-1 text-xl font-semibold text-[var(--sf-brand)]">
              {formatKes(summary.cogs)}
            </div>
          </div>
          <div className="sf-stat rounded-xl border border-slate-100 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Gross profit
            </div>
            <div className="mt-1 text-xl font-semibold text-[var(--sf-brand)]">
              {formatKes(summary.gross)}
            </div>
          </div>
          <div className="sf-stat rounded-xl border border-slate-100 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Gross margin
            </div>
            <div className="mt-1 text-xl font-semibold text-[var(--sf-brand)]">
              {summary.margin.toFixed(1)}%
            </div>
          </div>
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
              <thead className="sf-thead">
                <tr>
                  <th className="px-3 py-2.5">Receipt</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Cashier</th>
                  <th className="px-3 py-2.5">Payment</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((s) => (
                  <tr key={s.id} className="sf-row">
                    <td className="px-3 py-2.5 font-medium">#{s.receiptNo}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {new Date(s.completedAt || s.createdAt).toLocaleString("en-KE")}
                    </td>
                    <td className="px-3 py-2.5">{s.customer?.name || "Walk-in"}</td>
                    <td className="px-3 py-2.5">{s.cashier.name}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {s.payments.map((p) => p.method).join(" · ")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {formatKes(s.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
          <span>
            {sales.length
              ? `Showing ${pageStart} – ${pageEnd} of ${sales.length}`
              : "Showing 0 of 0"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="sf-btn sf-btn-ghost"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="sf-btn sf-btn-ghost"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
