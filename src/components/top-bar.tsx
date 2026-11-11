"use client";

import Link from "next/link";
import { formatKes } from "@/lib/money";
import { IconMenu } from "./ui/icons";
import { ThemeToggle } from "./theme-toggle";
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
        className="grid size-9 place-items-center rounded-lg border border-[var(--sf-border)] bg-[var(--sf-surface)] text-[var(--sf-brand)] hover:bg-[var(--sf-surface-2)]"
        onClick={onToggleNav}
      >
        <IconMenu className="size-4" />
      </button>

      <div
        className={`flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 ${
          open
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
            : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
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
        <p
          className={`min-w-0 truncate text-xs font-semibold ${
            open
              ? "text-emerald-900 dark:text-emerald-100"
              : "text-amber-950 dark:text-amber-100"
          }`}
        >
          {open ? (
            <>
              <span>Live · {cashSession!.branchName}</span>
              <span className="mx-1.5 text-emerald-400 dark:text-emerald-500/80">·</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-300">
                Shift started: {cashSession!.openedAtLabel}
              </span>
            </>
          ) : cashSession?.branchName ? (
            `Closed · ${cashSession.branchName}`
          ) : (
            "No open session"
          )}
        </p>
        {open ? (
          <span className="hidden truncate text-[10px] font-medium text-emerald-700 sm:inline dark:text-emerald-300/90">
            · Float {formatKes(cashSession!.openingFloat)}
          </span>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/cash/drawer-sessions?action=move"
          className="hidden h-9 items-center gap-1.5 rounded-lg border border-[var(--sf-border)] bg-[var(--sf-surface)] px-3 text-xs font-semibold text-[var(--sf-brand)] hover:bg-[var(--sf-surface-2)] sm:inline-flex"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M7 7h13l-4-4M17 17H4l4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Cash In / Out
        </Link>
        <Link
          href={tillOpen ? "/cash/drawer-sessions?action=close" : "/cash/drawer-sessions?action=open"}
          className={
            tillOpen
              ? "inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
              : "inline-flex h-9 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
          }
        >
          {tillOpen ? (
            <>
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path strokeLinecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              Close shift
            </>
          ) : (
            "Open drawer"
          )}
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
