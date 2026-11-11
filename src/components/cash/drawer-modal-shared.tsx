"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { roundMoney } from "@/lib/money";

export const DENOMS = [1000, 500, 200, 100, 50, 40, 20, 10, 5, 1];

export function emptyDenomCounts(): Record<number, number> {
  return Object.fromEntries(DENOMS.map((d) => [d, 0]));
}

export function sumDenoms(counts: Record<number, number>) {
  return roundMoney(DENOMS.reduce((s, d) => s + d * (counts[d] || 0), 0));
}

export function DrawerModalShell({
  titleId,
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  titleId: string;
  title: string;
  subtitle: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(92vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--sf-border)] bg-white shadow-xl"
      >
        <header className="relative shrink-0 border-b border-slate-100 px-5 py-4 pr-12">
          <h2
            id={titleId}
            className="sf-display text-xl font-extrabold tracking-tight text-[var(--sf-brand)]"
          >
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-[var(--sf-muted)]">{subtitle}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3.5 grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">{children}</div>

        <div className="shrink-0 border-t border-slate-100 p-5">{footer}</div>
      </div>
    </div>,
    document.body
  );
}

export function DenominationCounter({
  counts,
  onChange,
  label = "Count by denomination",
}: {
  counts: Record<number, number>;
  onChange: (denom: number, next: number) => void;
  label?: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--sf-muted)]">{label}</p>
      <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
        {DENOMS.map((d) => {
          const sub = roundMoney(d * (counts[d] || 0));
          return (
            <li
              key={d}
              className="grid grid-cols-[minmax(0,1fr)_6.75rem_4.25rem] items-center gap-1.5 px-2.5 py-1.5"
            >
              <span className="font-mono text-xs font-semibold text-[var(--sf-brand)]">
                KSh {d.toLocaleString("en-KE")}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="grid size-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  onClick={() => onChange(d, (counts[d] || 0) - 1)}
                >
                  −
                </button>
                <input
                  className="h-7 w-9 rounded-lg border border-slate-200 text-center font-mono text-xs outline-none focus:border-[var(--sf-accent)]"
                  inputMode="numeric"
                  value={counts[d] || 0}
                  onChange={(e) => onChange(d, Number(e.target.value))}
                />
                <button
                  type="button"
                  className="grid size-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  onClick={() => onChange(d, (counts[d] || 0) + 1)}
                >
                  +
                </button>
              </div>
              <span className="text-right font-mono text-[10px] tabular-nums text-slate-400">
                {sub.toLocaleString("en-KE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
