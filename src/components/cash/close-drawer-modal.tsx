"use client";

import { useMemo, useState } from "react";
import { formatKes, formatMoneyParts, roundMoney } from "@/lib/money";
import { varianceClass } from "@/lib/cash-ui";
import {
  DenominationCounter,
  DrawerModalShell,
  emptyDenomCounts,
  sumDenoms,
} from "@/components/cash/drawer-modal-shared";

function MoneyLine({ amount, signed = false }: { amount: number; signed?: boolean }) {
  const parts = formatMoneyParts(Math.abs(amount));
  const prefix = signed ? (amount > 0.005 ? "+ " : amount < -0.005 ? "− " : "") : "";
  return (
    <span className="font-mono text-[13px] tabular-nums">
      {prefix}KSh {parts.whole}.{parts.frac}
    </span>
  );
}

export function CloseDrawerModal({
  branchName,
  openingFloat,
  cashSales,
  cashRefunds,
  cashOut,
  cashIn,
  expectedCash,
  expectedMpesa,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  branchName?: string;
  openingFloat: number;
  cashSales: number;
  cashRefunds: number;
  cashOut: number;
  cashIn: number;
  expectedCash: number;
  expectedMpesa: number;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (input: {
    countedCash: number;
    countedMpesa: number;
    note?: string;
  }) => Promise<void>;
}) {
  const [counts, setCounts] = useState(emptyDenomCounts);
  const [leaveRaw, setLeaveRaw] = useState("5000");
  const [note, setNote] = useState("");
  const [mpesaRaw, setMpesaRaw] = useState(String(expectedMpesa || 0));

  const counted = useMemo(() => sumDenoms(counts), [counts]);
  const leave = Math.max(0, Number(leaveRaw) || 0);
  const toBank = roundMoney(Math.max(0, counted - leave));
  const stays = roundMoney(Math.min(leave, counted));
  const variance = roundMoney(counted - expectedCash);
  const netMoves = roundMoney(cashIn - cashOut);

  function setCount(denom: number, next: number) {
    setCounts((prev) => ({ ...prev, [denom]: Math.max(0, Math.floor(next) || 0) }));
  }

  async function submit() {
    const leaveNote =
      counted > 0
        ? `Leave ${formatKes(stays)} in drawer · bank/safe ${formatKes(toBank)}`
        : "";
    const combined = [note.trim(), leaveNote].filter(Boolean).join(" · ");
    await onConfirm({
      countedCash: counted,
      countedMpesa: Number(mpesaRaw) || 0,
      note: combined || undefined,
    });
  }

  return (
    <DrawerModalShell
      titleId="close-drawer-title"
      title="Close drawer"
      subtitle={`Count cash and close the till${branchName ? ` for ${branchName}` : ""}.`}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="w-full rounded-xl bg-[var(--sf-accent)] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-[var(--sf-accent-deep)] disabled:opacity-50"
        >
          {busy ? "Closing…" : "Confirm & close drawer"}
        </button>
      }
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm">
        <div className="flex justify-between gap-3 text-[var(--sf-muted)]">
          <span>Opening float</span>
          <MoneyLine amount={openingFloat} />
        </div>
        <div className="mt-1.5 flex justify-between gap-3 text-[var(--sf-muted)]">
          <span>Cash sales</span>
          <span className="text-emerald-700">
            <MoneyLine amount={cashSales} signed />
          </span>
        </div>
        <div className="mt-1.5 flex justify-between gap-3 text-[var(--sf-muted)]">
          <span>Refunds</span>
          <span className="text-rose-700">
            <MoneyLine amount={-cashRefunds} signed />
          </span>
        </div>
        <div className="mt-1.5 flex justify-between gap-3 text-[var(--sf-muted)]">
          <span>Cash out / in</span>
          <span className={netMoves >= 0 ? "text-emerald-700" : "text-rose-700"}>
            <MoneyLine amount={netMoves} signed />
          </span>
        </div>
        <div className="mt-2.5 flex justify-between gap-3 border-t border-slate-200 pt-2.5 font-semibold text-[var(--sf-brand)]">
          <span>Expected</span>
          <MoneyLine amount={expectedCash} />
        </div>
        <div className="mt-1.5 flex justify-between gap-3 font-semibold text-[var(--sf-brand)]">
          <span>Counted</span>
          <MoneyLine amount={counted} />
        </div>
        <div className="mt-1.5 flex justify-between gap-3 text-sm">
          <span className="text-[var(--sf-muted)]">Variance</span>
          <span className={`font-mono font-bold tabular-nums ${varianceClass(variance)}`}>
            {formatKes(variance)}
          </span>
        </div>
      </div>

      <DenominationCounter counts={counts} onChange={setCount} />

      <label className="block text-xs font-bold uppercase tracking-wider text-[var(--sf-muted)]">
        Amount left in drawer (KSh)
        <input
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-[var(--sf-accent)] focus:ring-2 focus:ring-[var(--sf-accent-soft)]"
          inputMode="decimal"
          value={leaveRaw}
          onChange={(e) => setLeaveRaw(e.target.value)}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-[var(--sf-accent)]/20 bg-[var(--sf-accent-soft)] px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sf-accent-deep)]">
            Stays in drawer
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-[var(--sf-accent-deep)]">
            {formatKes(stays)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
            To bank / safe
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-[var(--sf-brand)]">
            {formatKes(toBank)}
          </p>
        </div>
      </div>

      <label className="block text-xs font-bold uppercase tracking-wider text-[var(--sf-muted)]">
        Counted M-Pesa (KSh)
        <input
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-[var(--sf-accent)] focus:ring-2 focus:ring-[var(--sf-accent-soft)]"
          inputMode="decimal"
          value={mpesaRaw}
          onChange={(e) => setMpesaRaw(e.target.value)}
        />
      </label>

      <label className="block text-xs font-bold uppercase tracking-wider text-[var(--sf-muted)]">
        Note (optional)
        <textarea
          className="mt-1.5 min-h-16 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--sf-accent)] focus:ring-2 focus:ring-[var(--sf-accent-soft)]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </DrawerModalShell>
  );
}
