"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { canManageUsers, canViewAudit } from "@/lib/permissions";
import { Role } from "@prisma/client";
import {
  IconBox,
  IconBuilding,
  IconCart,
  IconCash,
  IconChart,
  IconClose,
  IconGrid,
  IconLedger,
  IconReceipt,
  IconSettings,
  IconShield,
  IconTag,
  IconTruck,
  IconUndo,
  IconUsers,
  IconWallet,
} from "./ui/icons";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  audit?: boolean;
  admin?: boolean;
  manager?: boolean;
};

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: "Operations",
    items: [
      { href: "/overview", label: "Overview", icon: <IconGrid /> },
      { href: "/pos", label: "POS", icon: <IconCart /> },
      { href: "/cash", label: "Cash", icon: <IconCash /> },
    ],
  },
  {
    title: "Stock",
    items: [
      { href: "/inventory", label: "Inventory", icon: <IconBox /> },
      { href: "/purchasing", label: "Purchasing", icon: <IconTruck /> },
      { href: "/branches", label: "Branches", icon: <IconBuilding />, manager: true },
    ],
  },
  {
    title: "Commerce",
    items: [
      { href: "/sales", label: "Sales", icon: <IconChart /> },
      { href: "/receipts", label: "Receipts", icon: <IconReceipt /> },
      { href: "/customers", label: "Customers", icon: <IconUsers /> },
      { href: "/refunds", label: "Refund requests", icon: <IconUndo /> },
      { href: "/receivables", label: "Receivables", icon: <IconWallet /> },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: <IconChart /> },
      { href: "/accounting", label: "Accounting", icon: <IconLedger />, manager: true },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/promotions", label: "Promotions", icon: <IconTag />, manager: true },
      { href: "/settings", label: "Settings", icon: <IconSettings />, admin: true },
      { href: "/users", label: "Users", icon: <IconUsers />, admin: true },
      { href: "/audit", label: "Audit logs", icon: <IconShield />, audit: true },
    ],
  },
];

export function Sidebar({
  open,
  onClose,
  collapsed,
}: {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const { data } = useSession();
  const role = data?.user?.role as Role | undefined;
  const shop = process.env.NEXT_PUBLIC_SHOP_NAME || "Kenya Hardware";

  function visible(item: NavItem) {
    if (item.audit && role && !canViewAudit(role)) return false;
    if (item.admin && role && !canManageUsers(role)) return false;
    if (item.manager && role && role === "ATTENDANT") return false;
    return true;
  }

  const width = collapsed ? "w-[4.75rem]" : "w-64";

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex ${width} shrink-0 flex-col overflow-hidden text-white transition-[width,transform] duration-200 ease-out lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background:
            "linear-gradient(180deg, var(--sf-sidebar-2) 0%, var(--sf-sidebar) 55%, #0b1220 100%)",
          boxShadow: "8px 0 32px rgb(0 0 0 / 18%)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#0f9f8f22_0%,_transparent_55%)]" />
        <div className="relative flex h-14 items-center justify-between border-b border-white/10 px-4">
          <div className={`min-w-0 ${collapsed ? "mx-auto text-center" : ""}`}>
            <div className={`truncate font-semibold tracking-tight ${collapsed ? "text-sm" : "text-sm"}`}>
              {collapsed ? "KH" : shop}
            </div>
            {!collapsed && (
              <div className="text-[11px] text-[var(--sf-sidebar-muted)]">Point of Sale</div>
            )}
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <IconClose />
          </button>
        </div>

        <nav className="relative flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
          {groups.map((group) => {
            const items = group.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={group.title}>
                {!collapsed && (
                  <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--sf-sidebar-muted)]">
                    {group.title}
                  </div>
                )}
                <div className="space-y-1">
                  {items.map((l) => {
                    const active =
                      pathname === l.href || pathname.startsWith(l.href + "/");
                    return (
                      <Link
                        key={l.href}
                        href={l.href}
                        onClick={onClose}
                        title={collapsed ? l.label : undefined}
                        className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-150 ${
                          collapsed ? "justify-center px-2" : ""
                        } ${
                          active
                            ? "bg-gradient-to-r from-[var(--sf-accent)] to-[var(--sf-accent-deep)] text-white shadow-[0_8px_20px_-8px_#0f9f8faa]"
                            : "text-slate-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span
                          className={`shrink-0 transition ${active ? "opacity-100" : "opacity-80 group-hover:opacity-100"}`}
                        >
                          {l.icon}
                        </span>
                        {!collapsed && <span className="truncate tracking-tight">{l.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="relative border-t border-white/10 bg-black/20 p-3 backdrop-blur-sm">
          <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white"
              title={data?.user?.name || "User"}
            >
              {(data?.user?.name || "U").trim().charAt(0).toUpperCase()}
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{data?.user?.name}</div>
                <div className="truncate text-xs text-[var(--sf-sidebar-muted)]">
                  {data?.user?.role}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
