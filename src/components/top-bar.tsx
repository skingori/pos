"use client";

import Link from "next/link";
import { formatKes } from "@/lib/money";
import { IconMenu } from "./ui/icons";
import type { CashSessionInfo } from "./app-shell";

export function TopBar({
  tillOpen,
  cashSession,
  onToggleNav,
}: {
  tillOpen?: boolean;
  cashSession?: CashSessionInfo | null;
  onToggleNav: () => void;
}) {
  const open = Boolean(tillOpen && cashSession);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--sf-border)] bg-[var(--sf-surface)]/95 px-3 backdrop-blur-sm sm:px-5">
      <button
        type="button"
        aria-label="Open menu"
        className="grid size-9 place-items-center rounded-lg border border-[var(--sf-border)] bg-white text-[var(--sf-brand)] hover:bg-[var(--sf-surface-2)]"
        onClick={onToggleNav}
      >
        <IconMenu className="size-4" />
      </button>

      <div
        className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-1.5 ${
          open
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        <span className="relative flex size-2 shrink-0">
          {open ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          ) : null}
          <span
            className={`relative inline-flex size-2 rounded-full ${
              open ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
        </span>
        <div className="min-w-0 leading-tight">
          <p
            className={`sf-display truncate text-xs font-semibold ${
              open ? "text-emerald-900" : "text-amber-950"
            }`}
          >
            {open
              ? `Live · ${cashSession!.branchName}`
              : cashSession?.branchName
                ? `Closed · ${cashSession.branchName}`
                : "No open session"}
          </p>
          <p
            className={`hidden truncate text-[10px] sm:block ${
              open ? "text-emerald-700" : "text-amber-800"
            }`}
          >
            {open
              ? `Since ${cashSession!.openedAtLabel} · ${cashSession!.openedBy} · Float ${formatKes(cashSession!.openingFloat)}`
              : "Open the day from Cash to start selling"}
          </p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/cash/drawer-sessions"
          className="hidden h-9 items-center gap-1.5 rounded-lg border border-[var(--sf-border)] bg-white px-3 text-xs font-semibold text-[var(--sf-brand)] hover:bg-[var(--sf-surface-2)] sm:inline-flex"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M7 7h13l-4-4M17 17H4l4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Cash in / out
        </Link>
        <Link
          href={tillOpen ? "/cash/close-day" : "/cash/open-day"}
          className={
            tillOpen
              ? "inline-flex h-9 items-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              : "inline-flex h-9 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          }
        >
          {tillOpen ? "Close day" : "Open day"}
        </Link>
      </div>
    </header>
  );
}
