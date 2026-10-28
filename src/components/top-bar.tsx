"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { canManageUsers } from "@/lib/permissions";
import { IconBell, IconMenu } from "./ui/icons";

export function TopBar({
  sessionLabel,
  tillOpen,
  onMenuClick,
  onToggleCollapse,
  collapsed,
}: {
  sessionLabel?: string;
  tillOpen?: boolean;
  onMenuClick: () => void;
  onToggleCollapse: () => void;
  collapsed: boolean;
}) {
  const { data } = useSession();
  const role = data?.user?.role as Role | undefined;
  const open = sessionLabel?.includes("OPEN");
  const initial = (data?.user?.name || "U").trim().charAt(0).toUpperCase();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-[#f7f8fa] px-3 md:px-5">
      <button
        type="button"
        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200/60 lg:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <IconMenu />
      </button>
      <button
        type="button"
        className="hidden rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200/60 lg:inline-flex"
        onClick={onToggleCollapse}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <IconMenu />
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={`sf-chip max-w-full truncate ${
            open
              ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-900"
              : "border-amber-200/80 bg-amber-50/90 text-amber-900"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              open ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          <span className="truncate">{sessionLabel || "No open cash session"}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="hidden rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-600 sm:inline-flex"
          aria-label="Notifications"
        >
          <IconBell />
        </button>
        <Link
          href="/cash/drawer-sessions"
          className="hidden rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200/70 hover:text-slate-900 sm:inline-flex"
        >
          Cash out / in
        </Link>
        <Link
          href={tillOpen ? "/cash/close-day" : "/cash/open-day"}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200/70 hover:text-slate-900"
        >
          {tillOpen ? "Close day" : "Open day"}
        </Link>

        <div className="relative ml-0.5" ref={menuRef}>
          <button
            type="button"
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-slate-200/70"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Open user menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-medium text-slate-600 ring-1 ring-slate-200"
              aria-hidden
            >
              {initial}
            </span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            >
              <div className="border-b border-slate-100 px-3 py-2.5">
                <div className="truncate text-sm font-semibold text-[var(--sf-brand)]">
                  {data?.user?.name || "User"}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {data?.user?.email || role || ""}
                </div>
                {role && (
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {role}
                  </div>
                )}
              </div>
              <Link
                href="/change-password"
                role="menuitem"
                className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                Change password
              </Link>
              {role && canManageUsers(role) && (
                <Link
                  href="/settings"
                  role="menuitem"
                  className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Settings
                </Link>
              )}
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
