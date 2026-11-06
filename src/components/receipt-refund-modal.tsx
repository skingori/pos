"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatKes, roundMoney } from "@/lib/money";

type Condition = "SELLABLE" | "WRITE_OFF";
type Payout = "CASH" | "MPESA" | "CREDIT";

type SaleLine = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  unit?: string;
};

export type RefundSaleTarget = {
  id: string;
  receiptNo: number;
  customerId: string | null;
  customerName: string;
  customerPhone?: string | null;
  status: string;
  payments: { method: string; amount: number }[];
  lines: SaleLine[];
};

function statusLabel(status: string) {
  if (status === "COMPLETED") return "Payment Complete";
  return status.replace(/_/g, " ");
}

export function ReceiptRefundModal({
  sale,
  onClose,
  onDone,
}: {
  sale: RefundSaleTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [conditions, setConditions] = useState<Record<string, Condition>>({});
  const [payoutMethod, setPayoutMethod] = useState<Payout>("CASH");
  const [reason, setReason] = useState("");
  const [mpesaRef, setMpesaRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const initQty: Record<string, number> = {};
    const initCond: Record<string, Condition> = {};
    for (const l of sale.lines) {
      initQty[l.productId] = 0;
      initCond[l.productId] = "SELLABLE";
    }
    setQtys(initQty);
    setConditions(initCond);
    setReason("");
    setMpesaRef("");
    setError("");
    const paidCredit = sale.payments.some((p) => p.method === "CREDIT");
    const paidMpesa = sale.payments.some((p) => p.method === "MPESA");
    const paidCash = sale.payments.some((p) => p.method === "CASH");
    if (paidCredit && sale.customerId) setPayoutMethod("CREDIT");
    else if (paidMpesa && !paidCash) setPayoutMethod("MPESA");
    else setPayoutMethod("CASH");
  }, [sale]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totalDue = useMemo(() => {
    return roundMoney(
      sale.lines.reduce((sum, l) => {
        const q = qtys[l.productId] || 0;
        if (q <= 0 || l.qty <= 0) return sum;
        return sum + (l.lineTotal / l.qty) * q;
      }, 0)
    );
  }, [sale.lines, qtys]);

  const payoutHelp =
    payoutMethod === "CREDIT"
      ? "No cash leaves the drawer. Customer balance is reduced (or becomes store credit)."
      : payoutMethod === "MPESA"
        ? "Send funds to the customer phone / reverse the original M-Pesa."
        : "Hand cash to customer. Amount is deducted from expected till on close day.";

  function setQty(productId: string, next: number, max: number) {
    const q = Math.min(max, Math.max(0, Math.round(next * 1000) / 1000));
    setQtys((prev) => ({ ...prev, [productId]: q }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (payoutMethod === "CREDIT" && !sale.customerId) {
      setError("Credit refund needs a customer on this sale");
      return;
    }
    const lines = sale.lines
      .map((l) => ({
        productId: l.productId,
        qty: qtys[l.productId] || 0,
        condition: conditions[l.productId] || "SELLABLE",
      }))
      .filter((l) => l.qty > 0);
    if (!lines.length) {
      setError("Set qty on at least one item");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: sale.id,
          lines,
          reason: reason.trim() || null,
          payoutMethod,
          mpesaRef: payoutMethod === "MPESA" ? mpesaRef.trim() || null : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Refund failed");
        return;
      }
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--sf-border)] bg-white shadow-2xl"
        style={{ height: "min(680px, 90vh)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="refund-modal-title"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-[var(--sf-border)] bg-slate-50 px-6 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                id="refund-modal-title"
                className="text-lg font-bold text-[var(--sf-brand)]"
              >
                New refund · Receipt{" "}
                <span className="font-mono text-[var(--sf-accent)]">#{sale.receiptNo}</span>
              </h3>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                {statusLabel(sale.status)}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--sf-muted)]">
              Customer:{" "}
              <strong className="text-[var(--sf-brand)]">{sale.customerName}</strong>
              {sale.customerPhone ? ` (${sale.customerPhone})` : ""}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Set qty to return (e.g. 1 of 3). Leave others at 0. Managers approve immediately on
              submit.
            </p>
          </div>
          <button
            type="button"
            className="ml-4 shrink-0 rounded-lg border border-[var(--sf-border)] px-3 py-1.5 text-xs font-semibold text-[var(--sf-brand)] transition hover:bg-slate-100"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-3">
              {sale.lines.map((l) => {
                const q = qtys[l.productId] || 0;
                const lineRefund =
                  l.qty > 0 ? roundMoney((l.lineTotal / l.qty) * q) : 0;
                return (
                  <div
                    key={l.productId}
                    className="overflow-hidden rounded-xl border border-[var(--sf-border)] bg-white"
                  >
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-sm font-bold leading-tight text-[var(--sf-brand)]">
                        {l.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--sf-muted)]">
                        <span className="inline-flex items-center gap-1">
                          <svg
                            className="size-3 text-slate-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                            />
                          </svg>
                          Qty sold:{" "}
                          <strong className="text-[var(--sf-brand)]">
                            {l.qty}
                            {l.unit ? ` ${l.unit}` : ""}
                          </strong>
                        </span>
                        <span className="text-slate-200">·</span>
                        <span>
                          Unit:{" "}
                          <strong className="font-mono text-[var(--sf-brand)]">
                            {formatKes(l.unitPrice)}
                          </strong>
                        </span>
                        <span className="text-slate-200">·</span>
                        <span>
                          Line total:{" "}
                          <strong className="font-mono text-[var(--sf-brand)]">
                            {formatKes(l.lineTotal)}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-4 bg-slate-50/50 px-4 py-3">
                      <div className="min-w-[8rem]">
                        <label className="mb-1.5 block text-[11px] font-semibold tracking-wide text-[var(--sf-muted)] uppercase">
                          Return qty{" "}
                          <span className="font-normal normal-case text-slate-400">
                            (max {l.qty})
                          </span>
                        </label>
                        <div className="flex w-fit overflow-hidden rounded-lg border border-[var(--sf-border)] bg-white">
                          <button
                            type="button"
                            className="flex size-8 items-center justify-center border-r border-[var(--sf-border)] text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-[var(--sf-brand)]"
                            onClick={() => setQty(l.productId, q - 1, l.qty)}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={l.qty}
                            step="any"
                            value={q}
                            onChange={(e) =>
                              setQty(l.productId, Number(e.target.value) || 0, l.qty)
                            }
                            className="h-8 w-12 bg-transparent text-center font-mono text-sm font-bold text-[var(--sf-brand)] outline-none [appearance:textfield] focus:ring-2 focus:ring-inset focus:ring-[var(--sf-accent)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            className="flex size-8 items-center justify-center border-l border-[var(--sf-border)] text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-[var(--sf-brand)]"
                            onClick={() => setQty(l.productId, q + 1, l.qty)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="min-w-[10rem] flex-1">
                        <label className="mb-1.5 block text-[11px] font-semibold tracking-wide text-[var(--sf-muted)] uppercase">
                          Return condition
                        </label>
                        <select
                          className="w-full rounded-lg border border-[var(--sf-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--sf-brand)]"
                          value={conditions[l.productId] || "SELLABLE"}
                          onChange={(e) =>
                            setConditions((prev) => ({
                              ...prev,
                              [l.productId]: e.target.value as Condition,
                            }))
                          }
                        >
                          <option value="SELLABLE">Sellable (restock)</option>
                          <option value="WRITE_OFF">Damaged / Write-off</option>
                        </select>
                      </div>

                      <div className="ml-auto hidden text-right sm:block">
                        <label className="mb-1.5 block text-[11px] font-semibold tracking-wide text-[var(--sf-muted)] uppercase">
                          Refund value
                        </label>
                        <span className="font-mono text-sm font-bold text-rose-600">
                          {formatKes(lineRefund)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 space-y-4 border-t border-[var(--sf-border)] bg-white px-6 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="shrink-0">
                <p className="text-xs font-bold tracking-wider text-[var(--sf-muted)] uppercase">
                  Total Refund Due
                </p>
                <p className="mt-0.5 font-mono text-2xl font-extrabold text-rose-600">
                  {formatKes(totalDue)}
                </p>
              </div>

              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-bold text-[var(--sf-brand)]">
                  Payout method
                </label>
                <select
                  className="w-full rounded-xl border border-[var(--sf-border)] bg-white px-3.5 py-2.5 text-xs font-medium text-[var(--sf-brand)]"
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value as Payout)}
                >
                  <option value="CASH">Cash (from till)</option>
                  <option value="MPESA">M-Pesa reversal / Send to phone</option>
                  <option value="CREDIT" disabled={!sale.customerId}>
                    Customer credit / reduce balance
                  </option>
                </select>
                <p className="mt-1 text-[11px] text-[var(--sf-muted)]">{payoutHelp}</p>
              </div>
            </div>

            {payoutMethod === "MPESA" ? (
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--sf-brand)]">
                  M-Pesa reference
                </label>
                <input
                  className="w-full rounded-xl border border-[var(--sf-border)] bg-white px-3.5 py-2 font-mono text-xs text-[var(--sf-brand)] uppercase outline-none focus:ring-2 focus:ring-[var(--sf-accent)]"
                  value={mpesaRef}
                  onChange={(e) => setMpesaRef(e.target.value)}
                  placeholder="e.g. QHD824JL88"
                />
              </div>
            ) : null}

            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--sf-brand)]">Reason</label>
              <input
                className="w-full rounded-xl border border-[var(--sf-border)] bg-white px-3.5 py-2 text-xs text-[var(--sf-brand)] outline-none focus:ring-2 focus:ring-[var(--sf-accent)]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional note for the manager / audit trail"
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-4 pt-1">
              <p className="text-[11px] text-slate-400">
                Restocked items will immediately increment store inventory.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-[var(--sf-border)] px-4 py-2.5 text-xs font-semibold text-[var(--sf-muted)] transition hover:bg-slate-100"
                  onClick={onClose}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || totalDue <= 0}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {busy ? "Submitting…" : "Approve refund now"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
