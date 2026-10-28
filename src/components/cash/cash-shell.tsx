"use client";

import Link from "next/link";
import { CASH_TABS, type CashTab } from "@/lib/cash-ui";

export function CashShell({
  tab,
  title,
  description,
  actions,
  children,
}: {
  tab: CashTab;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const active = CASH_TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-5">
      <div className="text-xs text-slate-500">
        <Link href="/cash" className="hover:text-slate-800">
          Cash
        </Link>
        <span className="mx-1 text-slate-300">/</span>
        <span className="font-medium text-slate-700">{active.label}</span>
      </div>

      <nav
        aria-label="Cash sections"
        className="flex flex-wrap gap-1 rounded-2xl border border-slate-200/80 bg-white/70 p-1 shadow-sm backdrop-blur"
      >
        {CASH_TABS.map((t) => {
          const on = tab === t.id;
          return (
            <Link
              key={t.id}
              href={t.href}
              className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                on
                  ? "bg-[var(--sf-brand)] text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-br from-[var(--sf-brand)] to-[var(--sf-brand-soft)] bg-clip-text text-2xl font-semibold tracking-tight text-transparent md:text-[1.7rem]">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--sf-muted)]">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children}
    </div>
  );
}
