"use client";

import { useState } from "react";
import { formatKes } from "@/lib/money";

export function CashMoveModal({
  cashInDrawer,
  formulaHint,
  onClose,
  onSaved,
}: {
  cashInDrawer: number;
  formulaHint: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<"IN" | "OUT">("OUT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function record() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "move",
        type,
        amount: Number(amount),
        note: reason,
      }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Failed");
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="sf-modal-backdrop">
      <div className="sf-modal max-w-md">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Cash out / in</h2>
            <p className="mt-1 text-sm text-slate-500">
              Record cash that was added to or removed from the drawer outside of a sale (float
              top-up, supplier payment, etc.). Both feed into the close-day reconciliation.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-teal-200/70 bg-teal-50/50 p-3 text-sm">
          <div className="text-slate-500">Cash in drawer</div>
          <div className="text-lg font-semibold text-[var(--sf-brand)]">
            {formatKes(cashInDrawer)}
          </div>
          <p className="mt-1 text-xs text-slate-500">{formulaHint}</p>
        </div>

        {error && <p className="sf-alert sf-alert-error mt-3">{error}</p>}

        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium">
            Type
            <select
              className="sf-input mt-1"
              value={type}
              onChange={(e) => setType(e.target.value as "IN" | "OUT")}
            >
              <option value="OUT">Paid out (cash removed from drawer)</option>
              <option value="IN">Paid in (cash added to drawer)</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Amount
            <input
              className="sf-input mt-1"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </label>
          <label className="block text-sm font-medium">
            Reason
            <input
              className="sf-input mt-1"
              placeholder="e.g. Supplier delivery, petty cash"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="sf-btn sf-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="sf-btn sf-btn-primary"
            disabled={busy || !amount}
            onClick={record}
          >
            {busy ? "Saving..." : "Record"}
          </button>
        </div>
      </div>
    </div>
  );
}
