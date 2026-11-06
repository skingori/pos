"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { formatKes } from "@/lib/money";

export type VoidCreditTarget = {
  saleId: string;
  receiptNo: number;
  customerName: string;
  openAmount: number;
};

export function VoidCreditModal({
  target,
  onClose,
  onDone,
}: {
  target: VoidCreditTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/sales/${target.saleId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not void credit sale");
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
        className="w-full max-w-md space-y-4 overflow-hidden rounded-2xl border border-[var(--sf-border)] bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="void-credit-title"
      >
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-600">
            <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h3 id="void-credit-title" className="text-base font-bold text-[var(--sf-brand)]">
              Void Credit Sale
            </h3>
            <p className="text-xs text-[var(--sf-muted)]">
              Receipt{" "}
              <span className="font-mono font-bold text-[var(--sf-brand)]">
                #{target.receiptNo}
              </span>
            </p>
          </div>
        </div>

        <div className="space-y-1.5 rounded-xl border border-[var(--sf-border)] bg-slate-50 p-3.5 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-[var(--sf-muted)]">Customer:</span>
            <span className="font-bold text-[var(--sf-brand)]">{target.customerName}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--sf-muted)]">Unsettled Credit:</span>
            <span className="font-mono font-bold text-amber-600">
              {formatKes(target.openAmount)}
            </span>
          </div>
          <p className="border-t border-[var(--sf-border)] pt-1 text-[11px] text-slate-400">
            Voiding cancels this credit invoice, clears the customer balance, and restores items
            back to store inventory.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--sf-brand)]">
            Reason for voiding
          </label>
          <input
            className="sf-input w-full text-xs"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Order cancelled before delivery, duplicate entry"
          />
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            className="rounded-lg px-3.5 py-2 text-xs font-semibold text-[var(--sf-muted)] hover:bg-slate-100"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-amber-700 disabled:opacity-50"
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "Voiding…" : "Confirm Void Credit"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
