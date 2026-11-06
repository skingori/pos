"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatKes } from "@/lib/money";
import { IconClose } from "@/components/ui/icons";

export type PayMethodTab = "MPESA" | "CASH" | "BANK";

export type RecordPaymentTarget = {
  saleId: string;
  receiptNo: number;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  outstanding: number;
};

export function RecordPaymentModal({
  target,
  onClose,
  onRecorded,
}: {
  target: RecordPaymentTarget;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [method, setMethod] = useState<PayMethodTab>("MPESA");
  const [amount, setAmount] = useState(String(target.outstanding.toFixed(2)));
  const [phone, setPhone] = useState(target.customerPhone || "");
  const [mpesaCode, setMpesaCode] = useState("");
  const [tendered, setTendered] = useState("");
  const [note, setNote] = useState("");
  const [stkHint, setStkHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAmount(String(target.outstanding.toFixed(2)));
    setPhone(target.customerPhone || "");
    setMpesaCode("");
    setTendered("");
    setNote("");
    setStkHint("");
    setError("");
    setMethod("MPESA");
  }, [target]);

  const changeDue = useMemo(() => {
    const collect = Number(amount) || 0;
    const given = Number(tendered) || 0;
    return Math.max(0, given - collect);
  }, [amount, tendered]);

  function tabClass(active: boolean, accent: string) {
    return active
      ? `flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-xs font-semibold ${accent}`
      : "flex flex-col items-center gap-1.5 rounded-xl border border-[var(--sf-border)] bg-[var(--sf-surface-2)] p-3 text-xs font-semibold text-[var(--sf-brand)] hover:border-slate-400";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const collect = Number(amount);
    if (!Number.isFinite(collect) || collect <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (method === "MPESA" && !mpesaCode.trim()) {
      setError("Enter the confirmed M-Pesa code (STK is not live yet)");
      return;
    }
    if (method === "CASH" && tendered !== "" && Number(tendered) + 0.009 < collect) {
      setError("Cash tendered is less than amount to collect");
      return;
    }

    const noteParts = [
      note.trim(),
      method === "MPESA" && mpesaCode.trim() ? `M-Pesa: ${mpesaCode.trim().toUpperCase()}` : "",
      method === "MPESA" && phone.trim() ? `Phone: ${phone.trim()}` : "",
    ].filter(Boolean);

    setBusy(true);
    try {
      const res = await fetch("/api/receivables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: target.customerId,
          saleId: target.saleId,
          amount: collect,
          method,
          note: noteParts.join(" · ") || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not record payment");
        return;
      }
      onRecorded();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--sf-border)] bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-payment-title"
      >
        <div className="flex items-center justify-between border-b border-[var(--sf-border)] bg-slate-50 px-6 py-4">
          <div>
            <h3
              id="record-payment-title"
              className="flex items-center gap-2 text-base font-bold text-[var(--sf-brand)]"
            >
              <span>Record Payment</span>
              <span className="rounded bg-orange-100 px-2 py-0.5 font-mono text-xs font-semibold text-orange-800">
                #{target.receiptNo}
              </span>
            </h3>
            <p className="mt-0.5 text-xs text-[var(--sf-muted)]">
              {target.customerName} · Trade account
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose className="size-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div>
              <p className="text-xs font-semibold uppercase text-amber-800">Outstanding Balance</p>
              <p className="mt-0.5 font-mono text-xl font-bold text-amber-950">
                {formatKes(target.outstanding)}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg bg-amber-200 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-300"
              onClick={() => setAmount(String(target.outstanding.toFixed(2)))}
            >
              Pay Full Balance
            </button>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-bold text-[var(--sf-brand)]">Select Payment Method</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className={tabClass(
                  method === "MPESA",
                  "border-emerald-500 bg-emerald-50 text-emerald-800"
                )}
                onClick={() => setMethod("MPESA")}
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                  M
                </span>
                <span>M-Pesa STK</span>
              </button>
              <button
                type="button"
                className={tabClass(
                  method === "CASH",
                  "border-[var(--sf-accent)] bg-[var(--sf-accent-soft)] text-[var(--sf-accent-deep)]"
                )}
                onClick={() => setMethod("CASH")}
              >
                <svg className="size-6 text-[var(--sf-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
                <span>Cash</span>
              </button>
              <button
                type="button"
                className={tabClass(
                  method === "BANK",
                  "border-sky-500 bg-sky-50 text-sky-800"
                )}
                onClick={() => setMethod("BANK")}
              >
                <svg className="size-6 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <span>Bank Transfer</span>
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[var(--sf-brand)]">
              Amount to Collect (KSh)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                KSh
              </span>
              <input
                type="number"
                step="0.01"
                min={0.01}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-[var(--sf-border)] bg-white py-2.5 pl-12 pr-4 font-mono text-base font-bold text-[var(--sf-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--sf-accent)]"
              />
            </div>
          </div>

          {method === "MPESA" ? (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
              <div>
                <label className="mb-1 block text-xs font-bold text-emerald-900">
                  Customer M-Pesa Mobile Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 0712345678"
                    className="flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 font-mono text-xs text-[var(--sf-brand)]"
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                    onClick={() =>
                      setStkHint(
                        "Live STK is not connected yet — enter the confirmed M-Pesa code below after the customer pays."
                      )
                    }
                  >
                    Send STK Prompt
                  </button>
                </div>
                {stkHint ? (
                  <p className="mt-1 text-[11px] text-emerald-800">{stkHint}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Or enter confirmed M-Pesa Code
                </label>
                <input
                  type="text"
                  value={mpesaCode}
                  onChange={(e) => setMpesaCode(e.target.value)}
                  placeholder="e.g. QHD824JL88"
                  className="w-full rounded-lg border border-[var(--sf-border)] bg-white px-3 py-2 font-mono text-xs uppercase text-[var(--sf-brand)]"
                />
              </div>
            </div>
          ) : null}

          {method === "CASH" ? (
            <div className="space-y-2 rounded-xl border border-[var(--sf-border)] bg-slate-50 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--sf-muted)]">Tendered Cash:</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Amount given"
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  className="w-28 rounded border border-[var(--sf-border)] bg-white px-2 py-1 font-mono text-xs font-bold"
                />
              </div>
              <div className="flex items-center justify-between border-t border-[var(--sf-border)] pt-1 text-xs font-bold">
                <span>Change to return:</span>
                <span className="font-mono text-sm text-emerald-600">{formatKes(changeDue)}</span>
              </div>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Receipt Notes / Reference (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Paid in full by foreman Juma"
              className="w-full rounded-lg border border-[var(--sf-border)] bg-white px-3 py-2 text-xs text-[var(--sf-brand)]"
            />
          </div>

          {error ? <p className="text-xs font-semibold text-rose-600">{error}</p> : null}

          <div className="flex items-center justify-end gap-3 border-t border-[var(--sf-border)] pt-3">
            <button
              type="button"
              className="rounded-xl px-4 py-2 text-xs font-semibold text-[var(--sf-muted)] hover:bg-slate-100"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[var(--sf-accent)] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[var(--sf-accent-deep)] disabled:opacity-60"
            >
              {busy ? "Recording…" : "Confirm & Record Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
