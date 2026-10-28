"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export function AppShell({
  children,
  sessionLabel,
  tillOpen,
}: {
  children: React.ReactNode;
  sessionLabel?: string;
  activeBranch?: { id: string; name: string; code: string };
  tillOpen?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen text-[var(--sf-text)]">
      <Sidebar
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        collapsed={collapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          sessionLabel={sessionLabel}
          tillOpen={tillOpen}
          onMenuClick={() => setMobileOpen(true)}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          collapsed={collapsed}
        />
        <main className="sf-enter flex-1 p-4 md:p-6 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
