"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export type CashSessionInfo = {
  branchName: string;
  openedAtLabel: string;
  openedBy: string;
  openingFloat: number;
};

export function AppShell({
  children,
  tillOpen,
  cashSession,
}: {
  children: React.ReactNode;
  activeBranch?: { id: string; name: string; code: string };
  tillOpen?: boolean;
  cashSession?: CashSessionInfo | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function toggleNav() {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setCollapsed((c) => !c);
      setMobileOpen(false);
    } else {
      setMobileOpen((o) => !o);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--sf-bg)] text-[var(--sf-text)] antialiased [font-variant-numeric:tabular-nums]">
      <Sidebar
        open={mobileOpen}
        collapsed={collapsed}
        onClose={() => setMobileOpen(false)}
        tillOpen={tillOpen}
        cashSession={cashSession}
      />
      <div
        className={`transition-[padding] duration-200 ${
          collapsed ? "lg:pl-0" : "lg:pl-[17rem]"
        }`}
      >
        <TopBar
          tillOpen={tillOpen}
          cashSession={cashSession}
          onToggleNav={toggleNav}
        />
        <main className="sf-enter mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
