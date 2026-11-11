"use client";

import { Fragment, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { formatKes } from "@/lib/money";
import { useSession } from "next-auth/react";
import { hasPermission } from "@/lib/permissions";
import { useSearchParams } from "next/navigation";

type Refund = {
  id: string;
  status: string;
  amount: number;
  reason: string | null;
  payoutMethod: string;
  mpesaRef: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  sale: {
    receiptNo: number;
    id: string;
    customerId: string | null;
    customer?: { name: string } | null;
  };
  requester: { name: string };
  reviewer?: { name: string } | null;
  lines: {
    qty: number;
    amount: number;
    condition: string;
    product: { name: string };
  }[];
};

type Sale = {
  id: string;
  receiptNo: number;
  customerId: string | null;
  customer?: { name: string } | null;
  lines: { productId: string; name: string; qty: number; lineTotal: number }[];
  payments?: { method: string; amount: number }[];
};

type Condition = "SELLABLE" | "OPENED" | "WRITE_OFF";
type Payout = "CASH" | "MPESA" | "CREDIT";
type Tab = "requests" | "history";
type StatusFilter = "PENDING" | "APPROVED" | "REJECTED" | "ALL";
type FocusStat = "pending" | "approved" | "amount" | "writeoffs";

function statusBadge(status: string) {
  if (status === "PENDING") return "bg-[#fff5e5] text-[#b8660d]";
  if (status === "APPROVED") return "bg-[#ecfaf1] text-[#057345]";
  if (status === "REJECTED") return "bg-[#fff0f2] text-[#e01c47]";
  return "bg-slate-100 text-slate-700";
}

function conditionLabel(c: string) {
  if (c === "SELLABLE") return "Sellable";
  if (c === "OPENED") return "Opened";
  if (c === "WRITE_OFF") return "Write off";
  return c;
}

function shortKes(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `KSh ${(n / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `KSh ${(n / 1_000).toFixed(1)}k`;
  return formatKes(n);
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} · ${time}`;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function roundPreview(lines: { qty: number; lineTotal: number; soldQty: number }[]) {
  return (
    Math.round(
      lines.reduce((s, l) => {
        if (l.qty <= 0 || l.soldQty <= 0) return s;
        return s + (l.lineTotal / l.soldQty) * l.qty;
      }, 0) * 100
    ) / 100
  );
}

function RefundsInner() {
  const { data: session } = useSession();
  const canApprove = hasPermission(session?.user, "refunds.approve");
  const search = useSearchParams();
  const saleIdParam = search.get("saleId");

  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("requests");
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [payoutFilter, setPayoutFilter] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [focusStat, setFocusStat] = useState<FocusStat>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [sale, setSale] = useState<Sale | null>(null);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [conditions, setConditions] = useState<Record<string, Condition>>({});
  const [payoutMethod, setPayoutMethod] = useState<Payout>("CASH");
  const [mpesaRef, setMpesaRef] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [approvePayout, setApprovePayout] = useState<Record<string, Payout>>({});
  const [approveMpesaRef, setApproveMpesaRef] = useState<Record<string, string>>({});
  const [serials, setSerials] = useState<Record<string, string>>({});
  const [trackSerialByProduct, setTrackSerialByProduct] = useState<Record<string, boolean>>({});

  const ghostBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50";
  const primaryBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50";
  const approveBtn =
    "inline-flex h-8 items-center rounded-lg bg-emerald-700 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50";
  const filterCtrl =
    "h-8 min-w-[7.5rem] appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900";
  const compactInput =
    "h-8 rounded-lg border-0 bg-white px-2.5 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900";

  async function load() {
    setLoading(true);
    const list = await fetch("/api/refunds").then((r) => r.json());
    setRefunds(Array.isArray(list) ? list : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!saleIdParam) return;
    setTab("requests");
    Promise.all([
      fetch(`/api/sales/${saleIdParam}`).then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
    ]).then(([s, products]) => {
      if (!s?.id) {
        setError("Sale not found");
        return;
      }
      setSale(s);
      const track: Record<string, boolean> = {};
      for (const p of products || []) track[p.id] = Boolean(p.trackSerial);
      setTrackSerialByProduct(track);
      const initQty: Record<string, string> = {};
      const initCond: Record<string, Condition> = {};
      s.lines?.forEach((l: { productId: string }) => {
        initQty[l.productId] = "0";
        initCond[l.productId] = "SELLABLE";
      });
      if (s.lines?.[0]) initQty[s.lines[0].productId] = "1";
      setQtys(initQty);
      setConditions(initCond);
      setSerials({});
      const paidCash = s.payments?.some((p: { method: string }) => p.method === "CASH");
      const paidMpesa = s.payments?.some((p: { method: string }) => p.method === "MPESA");
      const paidCredit = s.payments?.some((p: { method: string }) => p.method === "CREDIT");
      if (paidCredit) setPayoutMethod("CREDIT");
      else if (paidMpesa && !paidCash) setPayoutMethod("MPESA");
      else setPayoutMethod("CASH");
    });
  }, [saleIdParam]);

  const stats = useMemo(() => {
    const today = ymd(new Date());
    const monthStart = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const pending = refunds.filter((r) => r.status === "PENDING").length;
    const approvedToday = refunds.filter((r) => {
      if (r.status !== "APPROVED") return false;
      const when = r.reviewedAt || r.createdAt;
      return ymd(new Date(when)) === today;
    }).length;
    const refundedMonth = refunds
      .filter((r) => r.status === "APPROVED" && ymd(new Date(r.reviewedAt || r.createdAt)) >= monthStart)
      .reduce((s, r) => s + r.amount, 0);
    const writeOffs = refunds
      .filter((r) => r.status === "APPROVED")
      .reduce(
        (s, r) => s + r.lines.filter((l) => l.condition === "WRITE_OFF" || l.condition === "OPENED").length,
        0
      );
    return { pending, approvedToday, refundedMonth, writeOffs };
  }, [refunds]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return refunds.filter((r) => {
      if (tab === "requests") {
        if (status !== "ALL" && r.status !== status) return false;
      } else if (r.status === "PENDING") {
        return false;
      }
      if (payoutFilter && r.payoutMethod !== payoutFilter) return false;
      if (!term) return true;
      return (
        String(r.sale.receiptNo).includes(term) ||
        r.requester.name.toLowerCase().includes(term) ||
        (r.sale.customer?.name || "").toLowerCase().includes(term) ||
        (r.reason || "").toLowerCase().includes(term) ||
        (r.mpesaRef || "").toLowerCase().includes(term) ||
        r.lines.some((l) => l.product.name.toLowerCase().includes(term))
      );
    });
  }, [refunds, tab, status, q, payoutFilter]);

  const refundPreview = sale
    ? roundPreview(
        sale.lines.map((l) => ({
          qty: Number(qtys[l.productId] || 0),
          lineTotal: l.lineTotal,
          soldQty: l.qty,
        }))
      )
    : 0;

  async function submit() {
    if (!sale) return;
    setError("");
    if (payoutMethod === "CREDIT" && !sale.customerId) {
      setError("Credit refund needs a customer on this sale");
      return;
    }
    const lines = sale.lines
      .map((l) => ({
        productId: l.productId,
        qty: Number(qtys[l.productId] || 0),
        condition: conditions[l.productId] || "SELLABLE",
        serials: trackSerialByProduct[l.productId] ? serials[l.productId] : undefined,
      }))
      .filter((l) => l.qty > 0);
    if (!lines.length) {
      setError("Set qty on at least one item");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saleId: sale.id,
        lines,
        reason,
        payoutMethod,
        mpesaRef: payoutMethod === "MPESA" ? mpesaRef || null : null,
      }),
    });
    setSaving(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setSale(null);
    setReason("");
    setMpesaRef("");
    await load();
    if (canApprove) setTab("history");
    else {
      setTab("requests");
      setStatus("PENDING");
    }
  }

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    setError("");
    setBusyId(id);
    const res = await fetch("/api/refunds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        decision,
        payoutMethod: approvePayout[id],
        mpesaRef: approveMpesaRef[id] || null,
      }),
    });
    setBusyId(null);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setExpandedId(null);
    load();
  }

  return (
    <div className="space-y-4 [font-variant-numeric:tabular-nums]">
      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
        aria-label="Refunds overview"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              Refunds
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">
                Approve returns, restock, and payout from till
              </span>
              {stats.pending > 0 ? (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  {stats.pending} pending
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href="/receipts" className={primaryBtn}>
              + New refund
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 border-t border-slate-200 lg:grid-cols-4 lg:divide-y-0">
          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "pending" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setFocusStat("pending");
              setTab("requests");
              setStatus("PENDING");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Pending
            </p>
            <span className="mt-0.5 font-mono text-base font-bold tracking-tight text-amber-700 sm:text-lg">
              {stats.pending}
            </span>
            <p className="mt-1 text-[11px] text-slate-500">Awaiting manager review</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Review queue →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "approved" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setFocusStat("approved");
              setTab("history");
              setStatus("APPROVED");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Approved today
            </p>
            <span className="mt-0.5 font-mono text-base font-bold tracking-tight text-emerald-700 sm:text-lg">
              {stats.approvedToday}
            </span>
            <p className="mt-1 text-[11px] text-slate-500">Restocked & paid out</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              View approved →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "amount" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setFocusStat("amount");
              setTab("history");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Refunded amount
            </p>
            <span className="mt-0.5 font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
              {shortKes(stats.refundedMonth)}
            </span>
            <p className="mt-1 text-[11px] text-slate-500">This month cash / M-Pesa / credit</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Payout mix →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "writeoffs" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setFocusStat("writeoffs");
              setTab("history");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Write-offs
            </p>
            <span className="mt-0.5 font-mono text-base font-bold tracking-tight text-rose-600 sm:text-lg">
              {stats.writeOffs}
            </span>
            <p className="mt-1 text-[11px] text-slate-500">Opened / damaged units</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              View write-offs →
            </span>
          </button>
        </div>
      </section>

      {error ? <p className="sf-alert sf-alert-error">{error}</p> : null}

      {sale ? (
        <section className="overflow-clip rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                New refund · Receipt #{sale.receiptNo}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {sale.customer?.name || "Walk-in"} · set return qty, condition, and payout
                {canApprove ? " · managers approve immediately on submit" : ""}
              </p>
            </div>
            <button type="button" className={ghostBtn} onClick={() => setSale(null)}>
              Cancel
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {sale.lines.map((l) => (
              <div
                key={l.productId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-900">{l.name}</p>
                  <p className="text-[11px] text-slate-500">
                    Sold {l.qty} · {formatKes(l.lineTotal)}
                  </p>
                </div>
                <input
                  className={`${compactInput} w-16 tabular-nums`}
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label={`Return qty for ${l.name}`}
                  value={qtys[l.productId] || "0"}
                  onChange={(e) => setQtys({ ...qtys, [l.productId]: e.target.value })}
                />
                <select
                  className={`${filterCtrl} min-w-[7rem]`}
                  value={conditions[l.productId] || "SELLABLE"}
                  onChange={(e) =>
                    setConditions({
                      ...conditions,
                      [l.productId]: e.target.value as Condition,
                    })
                  }
                  aria-label={`Condition for ${l.name}`}
                >
                  <option value="SELLABLE">Sellable</option>
                  <option value="OPENED">Opened</option>
                  <option value="WRITE_OFF">Write off</option>
                </select>
                {trackSerialByProduct[l.productId] && Number(qtys[l.productId] || 0) > 0 ? (
                  <input
                    className={`${compactInput} w-full font-mono sm:w-56`}
                    placeholder="Serial(s) returned"
                    value={serials[l.productId] || ""}
                    onChange={(e) => setSerials({ ...serials, [l.productId]: e.target.value })}
                  />
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2.5 rounded-xl bg-indigo-50/70 p-3.5">
            <p className="text-sm font-semibold text-slate-900">
              Refund due {formatKes(refundPreview)}
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                className={filterCtrl}
                value={payoutMethod}
                onChange={(e) => setPayoutMethod(e.target.value as Payout)}
                aria-label="Payout method"
              >
                <option value="CASH">Cash (till)</option>
                <option value="MPESA">M-Pesa</option>
                <option value="CREDIT" disabled={!sale.customerId}>
                  Credit
                </option>
              </select>
              <input
                className={`${compactInput} min-w-[10rem] flex-1`}
                placeholder="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {payoutMethod === "MPESA" ? (
                <input
                  className={`${compactInput} min-w-[8rem]`}
                  placeholder="M-Pesa ref"
                  value={mpesaRef}
                  onChange={(e) => setMpesaRef(e.target.value)}
                />
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className={ghostBtn} onClick={() => setSale(null)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving || refundPreview <= 0}
              className={primaryBtn}
            >
              {saving
                ? "Submitting…"
                : canApprove
                  ? "Approve refund now"
                  : "Submit refund request"}
            </button>
          </div>
        </section>
      ) : null}

      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
        aria-label="Refund requests"
      >
        <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5 sm:px-4">
          <div role="tablist" aria-label="Refund views" className="inline-flex rounded-lg bg-indigo-50 p-0.5">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "requests"}
              className={`h-7 rounded-md px-2.5 text-[11px] transition ${
                tab === "requests"
                  ? "bg-indigo-600 font-semibold text-white shadow-sm"
                  : "font-medium text-slate-700 hover:text-slate-900"
              }`}
              onClick={() => {
                setTab("requests");
                if (status === "ALL") setStatus("PENDING");
              }}
            >
              Requests{" "}
              <span className={tab === "requests" ? "text-indigo-200" : "text-slate-500"}>
                {stats.pending}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "history"}
              className={`h-7 rounded-md px-2.5 text-[11px] transition ${
                tab === "history"
                  ? "bg-indigo-600 font-semibold text-white shadow-sm"
                  : "font-medium text-slate-700 hover:text-slate-900"
              }`}
              onClick={() => setTab("history")}
            >
              History
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
          <label className="relative min-w-[160px] flex-1 sm:max-w-xs">
            <span className="sr-only">Search refunds</span>
            <input
              type="search"
              placeholder="Search receipt, customer, product…"
              className="h-8 w-full rounded-lg border-0 bg-white px-2.5 text-[11px] ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          {tab === "requests" ? (
            <select
              className={filterCtrl}
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="Status"
            >
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="ALL">All</option>
            </select>
          ) : null}
          <select
            className={filterCtrl}
            value={payoutFilter}
            onChange={(e) => setPayoutFilter(e.target.value)}
            aria-label="Payout method"
          >
            <option value="">All payouts</option>
            <option value="CASH">Cash</option>
            <option value="MPESA">M-Pesa</option>
            <option value="CREDIT">Credit</option>
          </select>
          <span className="ms-auto text-[11px] text-slate-500">
            {filtered.length} {tab === "requests" ? "request" : "refund"}
            {filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Loading refunds…</p>
        ) : !filtered.length ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            {tab === "requests" ? "No refund requests in this view." : "No refund history yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50/80 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5 sm:px-4">Receipt</th>
                  <th className="px-3 py-2.5 sm:px-4">When</th>
                  <th className="px-3 py-2.5 sm:px-4">Customer</th>
                  <th className="px-3 py-2.5 sm:px-4">Requested by</th>
                  <th className="px-3 py-2.5 sm:px-4">Status</th>
                  <th className="px-3 py-2.5 sm:px-4">Amount</th>
                  <th className="px-3 py-2.5 text-right sm:px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const open = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                        <td className="px-3 py-3 text-xs font-semibold text-slate-900 sm:px-4">
                          #{r.sale.receiptNo}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500 sm:px-4">
                          {formatWhen(r.createdAt)}
                        </td>
                        <td className="px-3 py-3 text-xs font-medium text-slate-900 sm:px-4">
                          {r.sale.customer?.name || "Walk-in"}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500 sm:px-4">
                          {r.requester.name}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(r.status)}`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs font-semibold tabular-nums text-slate-900 sm:px-4">
                          {formatKes(r.amount)}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {r.status === "PENDING" && canApprove ? (
                              <>
                                <button
                                  type="button"
                                  className={approveBtn}
                                  disabled={busyId === r.id}
                                  onClick={() =>
                                    setExpandedId(open ? null : r.id)
                                  }
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className={ghostBtn}
                                  disabled={busyId === r.id}
                                  onClick={() => decide(r.id, "REJECT")}
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className={ghostBtn}
                                onClick={() => setExpandedId(open ? null : r.id)}
                              >
                                {open ? "Hide" : "View"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <td colSpan={7} className="px-3 py-3 sm:px-4">
                            <div className="space-y-2 text-xs text-slate-600">
                              <p>
                                Payout {r.payoutMethod}
                                {r.mpesaRef ? ` · ${r.mpesaRef}` : ""}
                                {r.reason ? ` · Reason: ${r.reason}` : ""}
                              </p>
                              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                                {r.lines.map((l, i) => (
                                  <li key={i}>
                                    {l.product.name} ×{l.qty} · {formatKes(l.amount)} ·{" "}
                                    {conditionLabel(l.condition)}
                                  </li>
                                ))}
                              </ul>
                              {r.status === "PENDING" && canApprove ? (
                                <div className="flex flex-wrap items-end gap-2 pt-1">
                                  <label className="text-[11px] font-medium text-slate-500">
                                    Payout on approve
                                    <select
                                      className={`${filterCtrl} mt-1 block`}
                                      value={approvePayout[r.id] || r.payoutMethod || "CASH"}
                                      onChange={(e) =>
                                        setApprovePayout({
                                          ...approvePayout,
                                          [r.id]: e.target.value as Payout,
                                        })
                                      }
                                    >
                                      <option value="CASH">Cash</option>
                                      <option value="MPESA">M-Pesa</option>
                                      <option value="CREDIT" disabled={!r.sale.customerId}>
                                        Credit
                                      </option>
                                    </select>
                                  </label>
                                  {(approvePayout[r.id] || r.payoutMethod) === "MPESA" ? (
                                    <label className="text-[11px] font-medium text-slate-500">
                                      M-Pesa ref
                                      <input
                                        className={`${compactInput} mt-1 block min-w-[8rem]`}
                                        placeholder="Confirmation"
                                        value={approveMpesaRef[r.id] || ""}
                                        onChange={(e) =>
                                          setApproveMpesaRef({
                                            ...approveMpesaRef,
                                            [r.id]: e.target.value,
                                          })
                                        }
                                      />
                                    </label>
                                  ) : null}
                                  <button
                                    type="button"
                                    className={approveBtn}
                                    disabled={busyId === r.id}
                                    onClick={() => decide(r.id, "APPROVE")}
                                  >
                                    {busyId === r.id ? "Working…" : "Confirm approve & pay out"}
                                  </button>
                                </div>
                              ) : null}
                              {r.reviewer && r.reviewedAt ? (
                                <p className="text-slate-500">
                                  Reviewed by {r.reviewer.name} · {formatWhen(r.reviewedAt)}
                                </p>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5 text-xs text-slate-500 sm:px-4">
          <span>
            {filtered.length
              ? `Showing 1 – ${filtered.length} of ${filtered.length}`
              : "Showing 0 of 0"}
          </span>
          <div className="flex gap-1.5">
            <button type="button" className={ghostBtn} disabled>
              Previous
            </button>
            <button type="button" className={ghostBtn} disabled>
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function RefundsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading…</p>}>
      <RefundsInner />
    </Suspense>
  );
}
