"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { hasPermission, type Permission } from "@/lib/permissions";
import { formatKes } from "@/lib/money";
import { Role } from "@prisma/client";
import type { CashSessionInfo } from "./app-shell";
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
} from "./ui/icons";

type IconTone = "ops" | "stock" | "commerce" | "insights" | "admin";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  tone: IconTone;
  permission?: Permission;
  badge?: "refunds" | "outOfStock";
};

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: "Operations",
    items: [
      { href: "/overview", label: "Overview", icon: <IconGrid className="size-4" />, tone: "ops" },
      {
        href: "/pos",
        label: "POS",
        icon: <IconCart className="size-4" />,
        tone: "ops",
        permission: "pos.access",
      },
      {
        href: "/cash",
        label: "Cash",
        icon: <IconCash className="size-4" />,
        tone: "ops",
        permission: "cash.access",
      },
    ],
  },
  {
    title: "Stock",
    items: [
      {
        href: "/inventory",
        label: "Inventory",
        icon: <IconBox className="size-4" />,
        tone: "stock",
        permission: "inventory.view",
        badge: "outOfStock",
      },
      {
        href: "/purchasing",
        label: "Purchasing",
        icon: <IconTruck className="size-4" />,
        tone: "stock",
        permission: "purchasing.view",
      },
      {
        href: "/branches",
        label: "Branches",
        icon: <IconBuilding className="size-4" />,
        tone: "stock",
        permission: "branches.manage",
      },
    ],
  },
  {
    title: "Commerce",
    items: [
      {
        href: "/sales",
        label: "Sales",
        icon: <IconChart className="size-4" />,
        tone: "commerce",
        permission: "sales.view",
      },
      {
        href: "/receipts",
        label: "Receipts",
        icon: <IconReceipt className="size-4" />,
        tone: "commerce",
        permission: "receipts.access",
      },
      {
        href: "/customers",
        label: "Customers",
        icon: <IconUsers className="size-4" />,
        tone: "commerce",
        permission: "customers.access",
      },
      {
        href: "/refunds",
        label: "Refund requests",
        icon: <IconUndo className="size-4" />,
        tone: "commerce",
        permission: "refunds.request",
        badge: "refunds",
      },
    ],
  },
  {
    title: "Insights",
    items: [
      {
        href: "/reports",
        label: "Reports",
        icon: <IconChart className="size-4" />,
        tone: "insights",
        permission: "reports.view",
      },
      {
        href: "/accounting",
        label: "Accounting",
        icon: <IconLedger className="size-4" />,
        tone: "insights",
        permission: "accounting.view",
      },
    ],
  },
  {
    title: "Admin",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: <IconSettings className="size-4" />,
        tone: "admin",
        permission: "settings.manage",
      },
      {
        href: "/promotions",
        label: "Promotions",
        icon: <IconTag className="size-4" />,
        tone: "admin",
        permission: "promotions.manage",
      },
      {
        href: "/users",
        label: "Users",
        icon: <IconUsers className="size-4" />,
        tone: "admin",
        permission: "users.manage",
      },
      {
        href: "/audit",
        label: "Audit logs",
        icon: <IconShield className="size-4" />,
        tone: "admin",
        permission: "audit.view",
      },
    ],
  },
];

const TONE: Record<IconTone, string> = {
  ops: "text-orange-300",
  stock: "text-emerald-300",
  commerce: "text-sky-300",
  insights: "text-teal-300",
  admin: "text-slate-300",
};

function shopInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function Sidebar({
  open,
  onClose,
  collapsed,
  tillOpen,
  cashSession,
}: {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  tillOpen?: boolean;
  cashSession?: CashSessionInfo | null;
}) {
  const pathname = usePathname();
  const { data } = useSession();
  const role = data?.user?.role as Role | undefined;
  const [shop, setShop] = useState("Shop");
  const [pendingRefunds, setPendingRefunds] = useState(0);
  const [outOfStock, setOutOfStock] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/branding")
      .then((r) => r.json())
      .catch(() => null)
      .then((branding) => {
        if (cancelled || !branding?.shopName) return;
        setShop(String(branding.shopName));
      });

    function onShopUpdated(e: Event) {
      const name = (e as CustomEvent<{ shopName?: string }>).detail?.shopName;
      if (name) setShop(String(name));
    }
    window.addEventListener("sf:shop-updated", onShopUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("sf:shop-updated", onShopUpdated);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/refunds")
      .then((r) => r.json())
      .catch(() => [])
      .then((refunds) => {
        if (cancelled) return;
        setPendingRefunds(
          Array.isArray(refunds)
            ? refunds.filter((r: { status?: string }) => r.status === "PENDING").length
            : 0
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasPermission(data?.user, "inventory.view")) return;
    let cancelled = false;
    fetch("/api/products?stockAlerts=1")
      .then((r) => r.json())
      .catch(() => null)
      .then((alerts) => {
        if (cancelled || !alerts) return;
        setOutOfStock(Number(alerts.outOfStock) || 0);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.user]);

  function visible(item: NavItem) {
    if (!item.permission) return true;
    return hasPermission(data?.user, item.permission);
  }

  function badgeFor(item: NavItem) {
    if (item.badge === "refunds" && pendingRefunds > 0) {
      return (
        <span className="ml-auto rounded-md bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {pendingRefunds}
        </span>
      );
    }
    if (item.badge === "outOfStock" && outOfStock > 0) {
      return (
        <span
          className="ml-auto rounded-md bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
          title={`${outOfStock} out of stock`}
        >
          {outOfStock}
        </span>
      );
    }
    return null;
  }

  const userName = data?.user?.name || "User";
  const userRole = role ? String(role).replace(/_/g, " ") : "Signed in";
  const userInitial = userName.trim().charAt(0).toUpperCase();
  const showDesktop = !collapsed;
  const shiftOpen = Boolean(tillOpen && cashSession);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-950/50 transition-opacity duration-200 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col bg-[var(--sf-sidebar)] text-slate-300 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${showDesktop ? "lg:translate-x-0" : "lg:-translate-x-full"}`}
      >
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--sf-accent)] text-sm font-bold text-white">
              {shopInitials(shop)}
            </div>
            <div className="min-w-0">
              <p className="sf-display line-clamp-2 break-words text-sm font-semibold leading-tight text-white">
                {shop}
              </p>
              <p className="text-[11px] text-[var(--sf-sidebar-muted)]">Point of Sale</p>
            </div>
            <button
              type="button"
              className="ml-auto grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
              onClick={onClose}
              aria-label="Close menu"
            >
              <IconClose className="size-4" />
            </button>
          </div>

          <Link
            href="/cash"
            onClick={onClose}
            className={`mt-3 flex items-center gap-2.5 rounded-xl border px-3 py-2 transition ${
              shiftOpen
                ? "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15"
                : "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15"
            }`}
          >
            <span className="relative flex size-2 shrink-0">
              {shiftOpen ? (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              ) : null}
              <span
                className={`relative inline-flex size-2 rounded-full ${
                  shiftOpen ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            </span>
            <div className="min-w-0 leading-tight">
              <p
                className={`truncate text-xs font-semibold ${
                  shiftOpen ? "text-emerald-200" : "text-amber-100"
                }`}
              >
                {shiftOpen
                  ? `Shift open · ${cashSession!.branchName}`
                  : cashSession?.branchName
                    ? `Shift closed · ${cashSession.branchName}`
                    : "No open shift"}
              </p>
              <p className="truncate text-[10px] text-slate-400">
                {shiftOpen
                  ? `Started ${cashSession!.openedAtLabel} · Float ${formatKes(cashSession!.openingFloat)}`
                  : "Tap to open drawer"}
              </p>
            </div>
          </Link>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
          {groups.map((group) => {
            const items = group.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={group.title}>
                <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--sf-sidebar-muted)]">
                  {group.title}
                </p>
                <ul className="space-y-0.5">
                  {items.map((l) => {
                    const active =
                      pathname === l.href || pathname.startsWith(l.href + "/");
                    const badge = badgeFor(l);
                    return (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          onClick={onClose}
                          aria-current={active ? "page" : undefined}
                          className={`group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium transition ${
                            active
                              ? "bg-[var(--sf-sidebar-hover)] text-white ring-1 ring-white/10"
                              : "text-slate-300 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <span
                            className={`grid size-7 shrink-0 place-items-center rounded-md transition ${
                              active
                                ? "bg-[var(--sf-accent)] text-white"
                                : `bg-white/5 ${TONE[l.tone]} group-hover:bg-white/10`
                            }`}
                          >
                            {l.icon}
                          </span>
                          <span className="min-w-0 truncate">{l.label}</span>
                          {badge}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-2.5">
          <div className="flex items-center gap-2.5 rounded-xl bg-white/5 p-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-xs font-semibold text-white">
              {userInitial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{userName}</p>
              <p className="truncate text-[11px] text-[var(--sf-sidebar-muted)]">{userRole}</p>
            </div>
            <button
              type="button"
              aria-label="Sign out"
              title="Sign out"
              className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M8 3.5H4.5v13H8M12 6.5l3.5 3.5-3.5 3.5M15.5 10H7.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
