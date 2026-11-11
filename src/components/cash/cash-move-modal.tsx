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
  const [type, setType] = useState<"IN" | "OUT">("IN");
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-move-title"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--sf-border)] bg-white shadow-xl"
      >
        <header className="relative border-b border-slate-100 px-5 py-3.5 pr-12">
          <h2
            id="cash-move-title"
            className="sf-display text-lg font-extrabold tracking-tight text-[var(--sf-brand)]"
          >
            Cash In / Cash Out (Drawer Float)
          </h2>
          <p className="mt-0.5 text-xs text-[var(--sf-muted)]">
            Expected now {formatKes(cashInDrawer)}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--sf-brand)]">Transaction Type</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("IN")}
                className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                  type === "IN"
                    ? "border-emerald-600/40 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-[var(--sf-brand)] hover:bg-slate-100"
                }`}
              >
                Cash In (Float Add)
              </button>
              <button
                type="button"
                onClick={() => setType("OUT")}
                className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                  type === "OUT"
                    ? "border-[var(--sf-accent)]/40 bg-[var(--sf-accent-soft)] text-[var(--sf-accent-deep)]"
                    : "border-slate-200 bg-slate-50 text-[var(--sf-brand)] hover:bg-slate-100"
                }`}
              >
                Cash Out (Drop/Expense)
              </button>
            </div>
          </div>

          <label className="block text-sm font-medium text-[var(--sf-brand)]">
            Amount (KSh)
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm outline-none placeholder:text-slate-400 focus:border-[var(--sf-accent)] focus:ring-2 focus:ring-[var(--sf-accent-soft)]"
              inputMode="decimal"
              placeholder="e.g. 50000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </label>

          <label className="block text-sm font-medium text-[var(--sf-brand)]">
            Reason / Description
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:font-mono placeholder:text-slate-400 focus:border-[var(--sf-accent)] focus:ring-2 focus:ring-[var(--sf-accent-soft)]"
              placeholder="e.g. Mid-day bank drop, petty cash for diesel"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>

          {formulaHint ? (
            <p className="text-[11px] leading-relaxed text-[var(--sf-muted)]">{formulaHint}</p>
          ) : null}

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !amount}
            onClick={record}
            className="rounded-xl bg-[var(--sf-brand)] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[var(--sf-brand-soft)] disabled:opacity-40"
          >
            {busy ? "Saving…" : "Record Movement"}
          </button>
        </footer>
      </div>
    </div>
  );
}
