"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatKes } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import { PageHeader } from "@/components/ui/page-header";
import { ThermalReceipt } from "@/components/thermal-receipt";

type SaleLine = {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  unit: string;
};

type Payment = {
  method: string;
  amount: number;
  mpesaReceipt?: string | null;
};

type Sale = {
  id: string;
  receiptNo: number;
  total: number;
  subtotal: number;
  discount: number;
  taxAmount: number;
  taxRate: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
  creditBalanceBefore?: number | null;
  customer: { name: string } | null;
  cashier: { name: string };
  payments: Payment[];
  lines: SaleLine[];
};

type Settings = {
  shopName: string;
  address?: string | null;
  phone?: string | null;
  kraPin?: string | null;
  receiptFooter: string;
};

type DatePreset = "today" | "week" | "month" | "last_month" | "custom";

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

export default function ReceiptsPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<DatePreset>("today");
  const [from, setFrom] = useState(() => rangeFor("today").from);
  const [to, setTo] = useState(() => rangeFor("today").to);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [method, setMethod] = useState("");
  const [credit, setCredit] = useState("all");
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Sale | null>(null);

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
    if (minAmount !== "") params.set("minAmount", minAmount);
    if (maxAmount !== "") params.set("maxAmount", maxAmount);
    if (method) params.set("method", method);
    if (credit && credit !== "all") params.set("credit", credit);
    if (q.trim()) params.set("q", q.trim());
    params.set("take", "500");

    const [list, s] = await Promise.all([
      fetch(`/api/sales?${params}`).then((r) => r.json()),
      settings
        ? Promise.resolve(settings)
        : fetch("/api/settings").then((r) => r.json()),
    ]);
    setSales(Array.isArray(list) ? list : []);
    if (s) setSettings(s);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, minAmount, maxAmount, method, credit, q]);

  useEffect(() => {
    setPage(1);
  }, [from, to, minAmount, maxAmount, method, credit, q, pageSize]);

  const pageCount = Math.max(1, Math.ceil(sales.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = sales.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(safePage * pageSize, sales.length);
  const paged = sales.slice((safePage - 1) * pageSize, safePage * pageSize);

  const totalFiltered = useMemo(
    () => sales.reduce((s, r) => s + r.total, 0),
    [sales]
  );

  function exportCsv() {
    const rows = sales.map((s) => ({
      receipt: s.receiptNo,
      date: s.completedAt || s.createdAt,
      customer: s.customer?.name || "Walk-in",
      cashier: s.cashier.name,
      total: s.total,
      status: s.status,
      payments: s.payments
        .map((p) =>
          p.mpesaReceipt ? `${p.method}:${p.mpesaReceipt}` : p.method
        )
        .join("|"),
      items: s.lines.map((l) => `${l.name} x${l.qty}`).join("; "),
    }));
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipts-${from || "all"}-${to || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function paymentLabel(s: Sale) {
    return s.payments
      .map((p) =>
        p.mpesaReceipt ? `${p.method} ${p.mpesaReceipt}` : p.method
      )
      .join(" · ");
  }

  const presets: { id: DatePreset; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "week", label: "This week" },
    { id: "month", label: "This month" },
    { id: "last_month", label: "Last month" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Receipts"
        description="Filter by date, sort, and paginate. Open a receipt to view or print."
      />

      <div className="sf-card overflow-hidden p-0">
        <div className="border-b border-slate-100 px-4 pt-4 pb-3">
          <h3 className="text-base font-semibold text-[var(--sf-brand)]">Receipts</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Filter by date, amount, and payment. Click View to print the 80mm receipt or start a
            refund.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
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
            <button
              type="button"
              className="sf-btn sf-btn-ghost ml-auto"
              disabled={!sales.length}
              onClick={exportCsv}
            >
              Export CSV
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-slate-500">
              Date from
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
              Date to
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
              Amount from
              <input
                type="number"
                min={0}
                step="0.01"
                className="sf-input mt-1"
                placeholder="0"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Amount to
              <input
                type="number"
                min={0}
                step="0.01"
                className="sf-input mt-1"
                placeholder="Any"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
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
                placeholder="Receipt #, M-Pesa code, customer, or product"
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

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Loading receipts…</p>
        ) : !paged.length ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No receipts for the current filters. Try a different date range or search.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sf-thead">
                <tr>
                  <th className="px-3 py-2.5">Receipt</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Cashier</th>
                  <th className="px-3 py-2.5">Payment</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5"></th>
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
                    <td className="px-3 py-2.5 text-xs text-slate-600">{paymentLabel(s)}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`sf-badge ${
                          s.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : s.status.includes("REFUND")
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {s.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {formatKes(s.total)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        className="sf-link text-xs"
                        onClick={() => setSelected(s)}
                        title="View receipt"
                      >
                        View
                      </button>
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
              ? `Showing ${pageStart} – ${pageEnd} of ${sales.length} · ${formatKes(totalFiltered)}`
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

      {selected && settings && (
        <div className="sf-modal-backdrop receipt-print-root">
          <div className="sf-modal max-w-sm">
            <div className="no-print mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">Receipt #{selected.receiptNo}</h2>
                <p className="text-xs text-slate-500">
                  {new Date(selected.completedAt || selected.createdAt).toLocaleString("en-KE")}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>

            <ThermalReceipt
              data={{
                ...selected,
                cashier: selected.cashier.name,
                shopName: settings.shopName,
                address: settings.address,
                phone: settings.phone,
                kraPin: settings.kraPin,
                receiptFooter: settings.receiptFooter || "Thank you!",
              }}
            />

            <div className="no-print mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="sf-btn sf-btn-primary flex-1"
                onClick={() => window.print()}
              >
                Print 80mm
              </button>
              <Link
                href={`/refunds?saleId=${selected.id}`}
                className="sf-btn sf-btn-ghost"
              >
                Refund
              </Link>
              <button
                type="button"
                className="sf-btn sf-btn-ghost"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
