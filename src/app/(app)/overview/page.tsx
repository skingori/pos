"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatKes } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Overview = {
  salesToday: number;
  salesTodayChange: number;
  profitToday: number;
  profitTodayChange: number;
  transactionsToday: number;
  transactionsTodayChange: number;
  newCustomersToday: number;
  newCustomersTodayChange: number;
  stockValue: number;
  outOfStock: number;
  lowStock: {
    id: string;
    name: string;
    qty: number;
    reorderLevel: number;
    unit: string;
    imageUrl: string | null;
    category: string;
  }[];
  salesTrend: { date: string; label: string; sales: number }[];
  salesByCategory: { name: string; revenue: number; percent: number }[];
  topProducts: {
    id: string;
    name: string;
    sold: number;
    imageUrl: string | null;
    category: string;
  }[];
  recentOrders: {
    id: string;
    receiptNo: number;
    customer: string;
    category: string;
    items: number;
    total: number;
    completedAt: string;
  }[];
};

const CAT_COLORS = ["#0f9f8f", "#2563eb", "#0c2340", "#d97706", "#e11d48", "#64748b"];

function changeTone(n: number) {
  if (n > 0) return "text-emerald-600";
  if (n < 0) return "text-rose-600";
  return "text-slate-400";
}

function formatChange(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function Thumb({
  src,
  name,
  tone = "brand",
}: {
  src?: string | null;
  name: string;
  tone?: "brand" | "rose";
}) {
  const bg =
    tone === "rose"
      ? "bg-rose-50 text-rose-700 ring-rose-100"
      : "bg-slate-100 text-[var(--sf-brand)] ring-slate-200";
  return (
    <div
      className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ${bg}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[11px] font-bold">{initials(name)}</span>
      )}
    </div>
  );
}

function KpiIcon({
  tone,
  children,
}: {
  tone: "teal" | "blue" | "green" | "amber";
  children: React.ReactNode;
}) {
  const map = {
    teal: "bg-teal-50 text-teal-700",
    blue: "bg-sky-50 text-sky-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className={`grid h-10 w-10 place-items-center rounded-xl ${map[tone]}`}>
      {children}
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    fetch("/api/reports/overview")
      .then((r) => r.json())
      .then(setData);
  }, []);

  const catColor = useMemo(() => {
    const map = new Map<string, string>();
    data?.salesByCategory.forEach((c, i) => map.set(c.name, CAT_COLORS[i % CAT_COLORS.length]));
    return map;
  }, [data]);

  if (!data) {
    return (
      <div className="sf-card flex h-40 items-center justify-center text-sm text-[var(--sf-muted)]">
        Loading dashboard…
      </div>
    );
  }

  const kpis = [
    {
      label: "Sales today",
      value: formatKes(data.salesToday),
      change: data.salesTodayChange,
      tone: "teal" as const,
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 2h12l1 7H5L6 2z" />
          <path d="M5 9v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
        </svg>
      ),
    },
    {
      label: "Orders today",
      value: String(data.transactionsToday),
      change: data.transactionsTodayChange,
      tone: "blue" as const,
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h5" />
        </svg>
      ),
    },
    {
      label: "Profit today",
      value: formatKes(data.profitToday),
      change: data.profitTodayChange,
      tone: "green" as const,
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
      ),
    },
    {
      label: "New customers",
      value: String(data.newCustomersToday),
      change: data.newCustomersTodayChange,
      tone: "amber" as const,
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6M22 11h-6" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overview"
        description="Today’s sales, trends, and stock alerts"
        actions={
          <>
            <Link href="/inventory" className="sf-btn sf-btn-primary">
              Add product
            </Link>
            <Link href="/pos" className="sf-btn sf-btn-ghost">
              Make a sale
            </Link>
            <Link href="/reports" className="sf-btn sf-btn-ghost">
              View reports
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="sf-card p-4">
            <div className="flex items-start justify-between gap-2">
              <KpiIcon tone={k.tone}>{k.icon}</KpiIcon>
              <span className={`text-xs font-semibold tabular-nums ${changeTone(k.change)}`}>
                {formatChange(k.change)}
              </span>
            </div>
            <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-[var(--sf-muted)]">
              {k.label}
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-[var(--sf-brand)] tabular-nums">
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="sf-card p-5">
          <h2 className="font-semibold text-[var(--sf-brand)]">Sales trend (last 7 days)</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.salesTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="sfSalesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f9f8f" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0f9f8f" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  formatter={(v) => formatKes(Number(v ?? 0))}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #c5d0dc",
                    boxShadow: "0 8px 24px -8px rgb(15 23 42 / 18%)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#0f9f8f"
                  strokeWidth={2.5}
                  fill="url(#sfSalesFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="sf-card p-5">
          <h2 className="font-semibold text-[var(--sf-brand)]">Sales by category</h2>
          {data.salesByCategory.length === 0 ? (
            <p className="mt-16 text-center text-sm text-[var(--sf-muted)]">
              No sales in the last 7 days
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="mx-auto h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.salesByCategory}
                      dataKey="revenue"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {data.salesByCategory.map((c, i) => (
                        <Cell key={c.name} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatKes(Number(v ?? 0))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="min-w-0 flex-1 space-y-2.5 text-sm">
                {data.salesByCategory.map((c, i) => (
                  <li key={c.name} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
                      />
                      <span className="truncate font-medium text-slate-700">{c.name}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums text-slate-500">
                      {c.percent}% · {formatKes(c.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="sf-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l2.4 7.2H22l-6 4.4 2.3 7L12 16.8 5.7 20.6 8 13.6 2 9.2h7.6z" />
              </svg>
            </span>
            <h2 className="font-semibold text-[var(--sf-brand)]">Top products</h2>
            <span className="ml-auto text-xs text-[var(--sf-muted)]">Last 7 days</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.topProducts.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Thumb src={p.imageUrl} name={p.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--sf-brand)]">
                    {p.name}
                  </div>
                  <div className="truncate text-xs text-slate-500">{p.category}</div>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-emerald-700">
                  {p.sold % 1 === 0 ? p.sold : p.sold.toFixed(1)}
                </span>
              </li>
            ))}
            {!data.topProducts.length && (
              <li className="py-8 text-center text-sm text-[var(--sf-muted)]">No products sold yet</li>
            )}
          </ul>
        </section>

        <section className="sf-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-rose-50 text-rose-600">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
            </span>
            <h2 className="font-semibold text-[var(--sf-brand)]">Low stock</h2>
            {data.outOfStock > 0 && (
              <span className="ml-auto text-xs font-semibold text-rose-600">
                {data.outOfStock} out of stock
              </span>
            )}
            {!data.outOfStock && data.lowStock.length > 0 && (
              <Link
                href="/inventory?belowReorder=1"
                className="ml-auto text-xs font-medium text-[var(--sf-accent)]"
              >
                View all
              </Link>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {data.lowStock.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Thumb src={p.imageUrl} name={p.name} tone="rose" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--sf-brand)]">
                    {p.name}
                  </div>
                  <div className="truncate text-xs text-slate-500">{p.category}</div>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                    p.qty <= 0
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  {p.qty} {p.unit}
                </span>
              </li>
            ))}
            {!data.lowStock.length && (
              <li className="py-8 text-center text-sm text-[var(--sf-muted)]">
                All stock above reorder levels
              </li>
            )}
          </ul>
        </section>
      </div>

      <section className="sf-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-50 text-sky-700">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
          </span>
          <h2 className="font-semibold text-[var(--sf-brand)]">Recent sales</h2>
          <Link
            href="/sales"
            className="ml-auto text-xs font-semibold text-[var(--sf-accent)] hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--sf-muted)]">
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Category</th>
                <th className="px-3 py-3 font-medium">Items</th>
                <th className="px-3 py-3 font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-[var(--sf-brand)]">
                        {initials(o.customer)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800">{o.customer}</div>
                        <div className="text-[11px] text-slate-400">#{o.receiptNo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background: catColor.get(o.category) || "#94a3b8",
                        }}
                      />
                      {o.category}
                    </span>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-slate-600">{o.items}</td>
                  <td className="px-3 py-3 font-semibold tabular-nums text-[var(--sf-brand)]">
                    {formatKes(o.total)}
                  </td>
                  <td className="px-3 py-3 text-slate-500">{relativeTime(o.completedAt)}</td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/sales?q=${o.receiptNo}`}
                      className="inline-grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[var(--sf-brand)]"
                      aria-label={`View receipt ${o.receiptNo}`}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))}
              {!data.recentOrders.length && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[var(--sf-muted)]">
                    No sales yet — open the till and ring your first sale
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
