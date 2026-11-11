"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatKes, formatMoneyParts } from "@/lib/money";
import {
  formatSessionWhen,
  varianceClass,
  type DetailPayload,
} from "@/lib/cash-ui";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

function Money({ amount, signed = false }: { amount: number; signed?: boolean }) {
  const parts = formatMoneyParts(Math.abs(amount));
  const prefix = signed ? (amount > 0.005 ? "+ " : amount < -0.005 ? "− " : "") : "";
  return (
    <span className="font-mono tabular-nums">
      {prefix}KSh {parts.whole}.{parts.frac}
    </span>
  );
}

export function SessionDetailModal({
  detail,
  loading,
  onClose,
}: {
  detail: DetailPayload | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const session = detail?.session;
  const totals = detail?.totals;
  const closed = session?.status === "CLOSED";
  const expectedCash = closed
    ? session?.expectedCash ?? 0
    : totals?.expectedCash ?? 0;
  const countedCash = session?.countedCash;
  const variance = session?.cashDifference;
  const netMoves = roundish((totals?.cashIn || 0) - (totals?.cashOut || 0));

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex justify-end bg-slate-900/40"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="z-report-title"
        className="flex h-full w-full max-w-[26rem] flex-col overflow-hidden border-l border-[var(--sf-border)] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !session || !totals ? (
          <p className="p-5 text-sm text-slate-500">Loading session details…</p>
        ) : (
          <>
            <header className="shrink-0 border-b border-slate-100 px-4 py-3.5 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sf-accent-deep)]">
                    Z-report · Session
                  </p>
                  <h2
                    id="z-report-title"
                    className="sf-display mt-1 truncate text-lg font-extrabold tracking-tight text-[var(--sf-brand)] sm:text-xl"
                  >
                    {session.branch?.name || "Drawer"} drawer
                  </h2>
                </div>
                <button
                  type="button"
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--sf-accent-soft)] text-xs font-bold text-[var(--sf-accent-deep)]">
                  {initials(session.openedBy.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--sf-brand)]">
                    {session.openedBy.name}
                  </p>
                  {session.openedBy.email ? (
                    <p className="truncate text-xs text-[var(--sf-muted)]">
                      {session.openedBy.email}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    closed
                      ? "bg-slate-100 text-slate-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {closed ? "Closed" : "Open"}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                    Opened
                  </p>
                  <p className="mt-0.5 truncate font-medium text-[var(--sf-brand)]">
                    {formatSessionWhen(session.createdAt)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                    Closed
                  </p>
                  <p className="mt-0.5 truncate font-medium text-[var(--sf-brand)]">
                    {session.closedAt
                      ? formatSessionWhen(session.closedAt)
                      : "Still open"}
                  </p>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="rounded-2xl border border-[var(--sf-border)] bg-white p-3.5 text-sm shadow-sm sm:p-4">
                <Row label="Opening float" value={<Money amount={session.openingFloat} />} />
                <Row
                  label="Cash sales"
                  value={
                    <span className="text-emerald-700">
                      <Money amount={totals.cashSales} signed />
                    </span>
                  }
                />
                <Row
                  label="Refunds"
                  value={
                    <span className="text-rose-700">
                      <Money amount={-totals.cashRefunds} signed />
                    </span>
                  }
                />
                <Row
                  label="Cash out / in"
                  value={
                    <span className={netMoves >= 0 ? "text-emerald-700" : "text-rose-700"}>
                      <Money amount={netMoves} signed />
                    </span>
                  }
                />
                <Row label="Expected" value={<Money amount={expectedCash} />} strong />
                {countedCash != null ? (
                  <Row label="Counted" value={<Money amount={countedCash} />} strong />
                ) : null}
                {variance != null ? (
                  <Row
                    label="Variance"
                    value={
                      <span className={`font-bold ${varianceClass(variance)}`}>
                        {Math.abs(variance) < 0.005 ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                            Balanced
                          </span>
                        ) : (
                          formatKes(variance)
                        )}
                      </span>
                    }
                  />
                ) : null}
              </div>

              {session.movements?.length ? (
                <div className="mt-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                    Adjustments
                  </p>
                  <ul className="mt-2 space-y-2">
                    {session.movements.map((m) => (
                      <li
                        key={m.id}
                        className="rounded-xl border border-[var(--sf-border)] bg-white px-3.5 py-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[var(--sf-brand)]">
                              {m.note || (m.type === "IN" ? "Cash in" : "Cash out")}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--sf-muted)]">
                              {formatSessionWhen(m.createdAt)}
                              {m.user?.name ? ` · ${m.user.name}` : ""}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 font-mono text-sm font-bold tabular-nums ${
                              m.type === "IN" ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {m.type === "IN" ? "+" : "−"}
                            {formatKes(m.amount).replace("KSh ", "")}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-4 text-center text-xs text-slate-400">No cash adjustments</p>
              )}

              {session.note ? (
                <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                  {session.note}
                </p>
              ) : null}

              {closed && session.closedBy ? (
                <p className="mt-4 text-xs text-[var(--sf-muted)]">
                  Closed by {session.closedBy.name}
                  {session.countedMpesa != null
                    ? ` · M-Pesa counted ${formatKes(session.countedMpesa)}`
                    : ""}
                </p>
              ) : null}
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body
  );
}

function roundish(n: number) {
  return Math.round(n * 100) / 100;
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 py-1.5 ${
        strong
          ? "mt-1 border-t border-slate-100 pt-2.5 font-semibold text-[var(--sf-brand)]"
          : "text-[var(--sf-muted)]"
      }`}
    >
      <span className="shrink-0">{label}</span>
      <span className={`min-w-0 truncate text-right ${strong ? "text-[var(--sf-brand)]" : ""}`}>
        {value}
      </span>
    </div>
  );
}

