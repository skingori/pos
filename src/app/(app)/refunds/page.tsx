"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { formatKes } from "@/lib/money";
import { useSession } from "next-auth/react";
import { canApproveRefund } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";

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

function statusBadge(status: string) {
  if (status === "PENDING") return "bg-amber-100 text-amber-900";
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-800";
  if (status === "REJECTED") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function conditionLabel(c: string) {
  if (c === "SELLABLE") return "Sellable (restock)";
  if (c === "OPENED") return "Opened / return SKU";
  if (c === "WRITE_OFF") return "Write off";
  return c;
}

function RefundsInner() {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const canApprove = role ? canApproveRefund(role) : false;
  const search = useSearchParams();
  const saleIdParam = search.get("saleId");

  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("requests");
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const pendingCount = useMemo(
    () => refunds.filter((r) => r.status === "PENDING").length,
    [refunds]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return refunds.filter((r) => {
      if (tab === "requests") {
        if (status !== "ALL" && r.status !== status) return false;
      } else if (r.status === "PENDING") {
        return false;
      }
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
  }, [refunds, tab, status, q]);

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
    load();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Refund requests"
        description="Attendant-submitted refund requests waiting for a manager to approve or reject. Approval restocks items and posts the cash entry."
        actions={
          <Link href="/receipts" className="sf-btn sf-btn-ghost">
            Start from Receipts
          </Link>
        }
      />

      {error && <p className="sf-alert sf-alert-error">{error}</p>}

      {sale && (
        <section className="sf-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[var(--sf-brand)]">
                New refund · Receipt #{sale.receiptNo}
              </h2>
              {sale.customer && (
                <p className="mt-0.5 text-xs text-slate-500">Customer: {sale.customer.name}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Set qty to return (e.g. 1 of 3). Leave others at 0.
                {canApprove
                  ? " Managers approve immediately on submit."
                  : " This will wait for manager approval."}
              </p>
            </div>
            <button
              type="button"
              className="sf-btn sf-btn-ghost"
              onClick={() => setSale(null)}
            >
              Cancel
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {sale.lines.map((l) => (
              <div
                key={l.productId}
                className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-[1fr_auto_auto]"
              >
                <div className="text-sm">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-slate-500">
                    Sold {l.qty} · {formatKes(l.lineTotal)}
                  </div>
                </div>
                <label className="text-xs font-medium text-slate-500">
                  Return qty
                  <input
                    className="sf-input mt-1 w-24"
                    type="number"
                    min={0}
                    step="0.01"
                    value={qtys[l.productId] || "0"}
                    onChange={(e) => setQtys({ ...qtys, [l.productId]: e.target.value })}
                  />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Condition
                  <select
                    className="sf-select mt-1 min-w-[160px]"
                    value={conditions[l.productId] || "SELLABLE"}
                    onChange={(e) =>
                      setConditions({
                        ...conditions,
                        [l.productId]: e.target.value as Condition,
                      })
                    }
                  >
                    <option value="SELLABLE">Sellable (restock)</option>
                    <option value="OPENED">Opened → return SKU</option>
                    <option value="WRITE_OFF">Write off</option>
                  </select>
                </label>
                {trackSerialByProduct[l.productId] && Number(qtys[l.productId] || 0) > 0 && (
                  <label className="text-xs font-medium text-slate-500 sm:col-span-3">
                    Serial(s) being returned
                    <input
                      className="sf-input mt-1 font-mono text-xs"
                      placeholder="One serial per unit"
                      value={serials[l.productId] || ""}
                      onChange={(e) =>
                        setSerials({ ...serials, [l.productId]: e.target.value })
                      }
                    />
                  </label>
                )}
              </div>
            ))}
          </div>

          <div className="sf-panel mt-4 space-y-3 p-3 text-sm">
            <div className="font-semibold">Refund due: {formatKes(refundPreview)}</div>
            <label className="block text-xs font-medium text-slate-500">
              Payout method
              <select
                className="sf-select mt-1"
                value={payoutMethod}
                onChange={(e) => setPayoutMethod(e.target.value as Payout)}
              >
                <option value="CASH">Cash (from till)</option>
                <option value="MPESA">M-Pesa (send manually, record here)</option>
                <option value="CREDIT" disabled={!sale.customerId}>
                  Customer credit / reduce balance
                </option>
              </select>
            </label>
            {payoutMethod === "MPESA" && (
              <label className="block text-xs font-medium text-slate-500">
                M-Pesa confirmation (optional)
                <input
                  className="sf-input mt-1"
                  value={mpesaRef}
                  onChange={(e) => setMpesaRef(e.target.value)}
                  placeholder="e.g. QLK7XXXX"
                />
              </label>
            )}
            {payoutMethod === "CASH" && (
              <p className="text-xs text-slate-500">
                Hand cash to customer. Amount is deducted from expected till on close day.
              </p>
            )}
            {payoutMethod === "CREDIT" && (
              <p className="text-xs text-slate-500">
                No cash leaves the drawer. Customer balance is reduced (or becomes store credit).
              </p>
            )}
            <label className="block text-xs font-medium text-slate-500">
              Reason
              <input
                className="sf-input mt-1"
                placeholder="Optional note for the manager"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={saving || refundPreview <= 0}
            className="sf-btn sf-btn-primary mt-4"
          >
            {saving
              ? "Submitting…"
              : canApprove
                ? "Approve refund now"
                : "Submit refund request"}
          </button>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100/80 p-1.5">
        <button
          type="button"
          onClick={() => setTab("requests")}
          className={`rounded-lg px-3 py-2 text-sm transition ${
            tab === "requests"
              ? "bg-white font-semibold text-[var(--sf-brand)] shadow-sm ring-1 ring-slate-200"
              : "text-slate-600 hover:bg-white/70"
          }`}
        >
          Requests
          {pendingCount > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`rounded-lg px-3 py-2 text-sm transition ${
            tab === "history"
              ? "bg-white font-semibold text-[var(--sf-brand)] shadow-sm ring-1 ring-slate-200"
              : "text-slate-600 hover:bg-white/70"
          }`}
        >
          Refunds (history)
        </button>
      </div>

      <div className="sf-card overflow-hidden p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--sf-brand)]">
              {tab === "requests" ? "Requests" : "Refunds (history)"}
            </h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {tab === "requests"
                ? "Pending and filtered requests waiting for action."
                : "Every recorded refund — direct manager refunds and approved returns. Read only; use Receipts to start a new refund."}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {tab === "requests" && (
              <label className="text-xs font-medium text-slate-500">
                Status
                <select
                  className="sf-select mt-1 min-w-[130px]"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StatusFilter)}
                >
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="ALL">All</option>
                </select>
              </label>
            )}
            <label className="text-xs font-medium text-slate-500">
              Search
              <input
                className="sf-input mt-1 min-w-[200px]"
                placeholder="Receipt #, customer, product…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
          </div>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Loading refunds…</p>
        ) : !filtered.length ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            {tab === "requests"
              ? "No refund requests in this view."
              : "No refund history yet."}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <div key={r.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--sf-brand)]">
                        Receipt #{r.sale.receiptNo}
                      </span>
                      <span className={`sf-badge ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                      <span className="text-sm font-medium tabular-nums">
                        {formatKes(r.amount)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Requested by {r.requester.name}
                      {r.sale.customer?.name ? ` · ${r.sale.customer.name}` : ""}
                      {" · "}
                      {new Date(r.createdAt).toLocaleString("en-KE")}
                      {" · "}
                      payout {r.payoutMethod}
                      {r.mpesaRef ? ` (${r.mpesaRef})` : ""}
                    </div>
                    {r.reviewer && r.reviewedAt && (
                      <div className="text-xs text-slate-500">
                        Reviewed by {r.reviewer.name} ·{" "}
                        {new Date(r.reviewedAt).toLocaleString("en-KE")}
                      </div>
                    )}
                    {r.reason && (
                      <p className="text-sm text-slate-600">Reason: {r.reason}</p>
                    )}
                    <ul className="mt-2 space-y-1 text-sm text-slate-700">
                      {r.lines.map((l, i) => (
                        <li key={i} className="flex flex-wrap gap-x-2">
                          <span>
                            {l.product.name} ×{l.qty}
                          </span>
                          <span className="text-slate-400">{formatKes(l.amount)}</span>
                          <span className="text-xs text-slate-500">
                            {conditionLabel(l.condition)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {r.status === "PENDING" && canApprove && (
                    <div className="w-full max-w-xs space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:w-auto">
                      <label className="block text-xs font-medium text-slate-500">
                        Payout on approve
                        <select
                          className="sf-select mt-1"
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
                      {(approvePayout[r.id] || r.payoutMethod) === "MPESA" && (
                        <label className="block text-xs font-medium text-slate-500">
                          M-Pesa ref
                          <input
                            className="sf-input mt-1"
                            placeholder="Confirmation code"
                            value={approveMpesaRef[r.id] || ""}
                            onChange={(e) =>
                              setApproveMpesaRef({
                                ...approveMpesaRef,
                                [r.id]: e.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="sf-btn sf-btn-accent"
                          disabled={busyId === r.id}
                          onClick={() => decide(r.id, "APPROVE")}
                        >
                          {busyId === r.id ? "Working…" : "Approve & pay out"}
                        </button>
                        <button
                          type="button"
                          className="sf-btn sf-btn-ghost"
                          disabled={busyId === r.id}
                          onClick={() => decide(r.id, "REJECT")}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function roundPreview(
  lines: { qty: number; lineTotal: number; soldQty: number }[]
) {
  return (
    Math.round(
      lines.reduce((s, l) => {
        if (l.qty <= 0 || l.soldQty <= 0) return s;
        return s + (l.lineTotal / l.soldQty) * l.qty;
      }, 0) * 100
    ) / 100
  );
}

export default function RefundsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading…</p>}>
      <RefundsInner />
    </Suspense>
  );
}
