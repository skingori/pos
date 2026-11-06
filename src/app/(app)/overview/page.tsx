"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatKes } from "@/lib/money";
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
  days: number;
  salesToday: number;
  salesTodayChange: number;
  profitToday: number;
  profitTodayChange: number;
  transactionsToday: number;
  transactionsTodayChange: number;
  newCustomersToday: number;
  newCustomersTodayChange: number;
  outOfStock: number;
  lowStockCount: number;
  pendingRefunds: number;
  openReceivables: number;
  rangeTotal: number;
  dailyAverage: number;
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
};

type Days = 7 | 30 | 90;

const CAT_COLORS = ["#10b981", "#6366f1", "#8b5cf6", "#0ea5e9", "#f43f5e", "#64748b"];
const CAT_PILL = [
  "bg-emerald-100 text-emerald-800",
  "bg-indigo-100 text-indigo-800",
  "bg-violet-100 text-violet-800",
  "bg-sky-100 text-sky-800",
  "bg-rose-100 text-rose-800",
  "bg-slate-100 text-slate-700",
];
const RANK_TONES = [
  { avatar: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500", sold: "bg-emerald-100 text-emerald-800" },
  { avatar: "bg-indigo-100 text-indigo-800", bar: "bg-indigo-500", sold: "bg-indigo-100 text-indigo-800" },
  { avatar: "bg-sky-100 text-sky-800", bar: "bg-sky-500", sold: "bg-sky-100 text-sky-800" },
  { avatar: "bg-violet-100 text-violet-800", bar: "bg-violet-500", sold: "bg-violet-100 text-violet-800" },
  { avatar: "bg-slate-100 text-slate-700", bar: "bg-slate-400", sold: "bg-slate-100 text-slate-700" },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function shortKes(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-KE", { maximumFractionDigits: 0 });
}

function ChangePill({ value, tone }: { value: number; tone: string }) {
  const abs = Math.abs(value);
  const flat = abs < 0.05;
  return (
    <p className={`mt-3 inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {flat ? (
        <svg className="size-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 10h12" strokeLinecap="round" />
        </svg>
      ) : value > 0 ? (
        <svg className="size-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M10 16V4M5 8.5L10 3.5l5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg className="size-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M10 4v12M5 11.5L10 16.5l5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {flat ? "0" : `${value > 0 ? "+" : ""}${value}`}% vs yesterday
    </p>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [days, setDays] = useState<Days>(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reports/overview?days=${days}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const maxSold = useMemo(
    () => Math.max(1, ...(data?.topProducts.map((p) => p.sold) || [1])),
    [data]
  );

  const catTotal = useMemo(
    () => data?.salesByCategory.reduce((s, c) => s + c.revenue, 0) || 0,
    [data]
  );

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-KE", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    []
  );

  if (!data && loading) {
    return <p className="py-16 text-center text-sm text-slate-500">Loading dashboard…</p>;
  }
  if (!data) {
    return <p className="py-16 text-center text-sm text-rose-600">Could not load overview</p>;
  }

  const periodLabel = `${days} days`;
  const lowClear = (data.lowStockCount || data.lowStock.length) === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-indigo-950">{todayLabel}</h1>
          <p className="mt-1 text-sm text-slate-500">Sales, trends and stock alerts</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/reports"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            View reports
          </Link>
          <Link
            href="/inventory"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <path d="M10 4v12M4 10h12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Add product
          </Link>
          <Link
            href="/pos"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <rect x="2.5" y="5" width="15" height="11" rx="2" />
              <path d="M2.5 8.5h15M13 12h2" strokeLinecap="round" />
            </svg>
            Make a sale
          </Link>
        </div>
      </div>

      <section aria-label="Today" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-emerald-50 p-5 shadow-sm ring-1 ring-emerald-200">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200">
              <svg className="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <rect x="2.5" y="5" width="15" height="10" rx="2" />
                <circle cx="10" cy="10" r="2.2" />
              </svg>
            </span>
            <p className="font-medium text-emerald-800">Sales today</p>
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-emerald-950">
            {formatKes(data.salesToday)}
          </p>
          <ChangePill value={data.salesTodayChange} tone="text-emerald-800" />
        </div>

        <div className="rounded-2xl bg-sky-50 p-5 shadow-sm ring-1 ring-sky-200">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white text-sky-700 shadow-sm">
              <svg className="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M5 2.5h10v15l-2.5-1.5L10 17.5 7.5 16 5 17.5z" />
                <path d="M8 7h4M8 10.5h4" strokeLinecap="round" />
              </svg>
            </span>
            <p className="font-medium text-sky-800">Orders today</p>
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-sky-950">
            {data.transactionsToday}
          </p>
          <ChangePill value={data.transactionsTodayChange} tone="text-sky-800" />
        </div>

        <div className="rounded-2xl bg-indigo-50 p-5 shadow-sm ring-1 ring-indigo-200">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm">
              <svg className="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M2.5 14l5-5 3 3 7-7M12.5 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="font-medium text-indigo-800">Profit today</p>
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-indigo-950">
            {formatKes(data.profitToday)}
          </p>
          <ChangePill value={data.profitTodayChange} tone="text-indigo-800" />
        </div>

        <div className="rounded-2xl bg-violet-50 p-5 shadow-sm ring-1 ring-violet-200">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white text-violet-700 shadow-sm">
              <svg className="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <circle cx="8" cy="7" r="3" />
                <path d="M2.5 16c.7-2.8 2.7-4 5.5-4s4.8 1.2 5.5 4M15 6v4M13 8h4" strokeLinecap="round" />
              </svg>
            </span>
            <p className="font-medium text-violet-800">New customers</p>
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-violet-950">
            {data.newCustomersToday}
          </p>
          <ChangePill value={data.newCustomersTodayChange} tone="text-violet-800" />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-12">
        <div className="overflow-clip rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm">
                <svg className="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M2.5 14l5-5 3 3 7-7M12.5 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <h2 className="text-lg font-semibold text-indigo-950">Sales trend</h2>
                <p className="text-sm text-slate-500">Last {periodLabel}</p>
              </div>
            </div>
            <div className="inline-flex rounded-lg bg-white/70 p-1 text-sm font-medium">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`h-8 rounded-md px-3 transition ${
                    days === d
                      ? "bg-indigo-600 font-semibold text-white shadow-sm"
                      : "text-indigo-900 hover:bg-white"
                  }`}
                  onClick={() => setDays(d)}
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-3">
            <div className="bg-indigo-50 px-6 py-4">
              <dt className="text-sm text-indigo-700">Total, {periodLabel}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-indigo-950">
                {formatKes(data.rangeTotal)}
              </dd>
            </div>
            <div className="bg-sky-50 px-6 py-4">
              <dt className="text-sm text-sky-700">Daily average</dt>
              <dd className="mt-0.5 text-lg font-semibold text-sky-950">
                {formatKes(data.dailyAverage)}
              </dd>
            </div>
            <div className="bg-violet-50 px-6 py-4">
              <dt className="text-sm text-violet-700">Today so far</dt>
              <dd className="mt-0.5 text-lg font-semibold text-violet-950">
                {formatKes(data.salesToday)}
              </dd>
            </div>
          </dl>

          <div className="p-6">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.salesTrend} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ovSalesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#64748b", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    interval={days === 7 ? 0 : "preserveStartEnd"}
                  />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip
                    formatter={(v) => formatKes(Number(v ?? 0))}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 8px 24px -8px rgb(15 23 42 / 18%)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fill="url(#ovSalesFill)"
                    dot={{ r: 3.5, fill: "#fff", stroke: "#6366f1", strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: "#4f46e5", stroke: "#fff", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="overflow-clip rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 xl:col-span-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-white text-sky-700 shadow-sm">
                <svg className="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <circle cx="10" cy="10" r="7" />
                  <path d="M10 3v7h7" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <h2 className="text-lg font-semibold text-sky-950">Sales by category</h2>
                <p className="text-sm text-slate-500">Last {periodLabel}</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            {data.salesByCategory.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-500">No sales in this period</p>
            ) : (
              <>
                <div className="relative mx-auto size-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.salesByCategory}
                        dataKey="revenue"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={70}
                        paddingAngle={1.5}
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
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] text-slate-500">Total</span>
                    <span className="text-[17px] font-semibold text-slate-900">
                      {shortKes(catTotal)}
                    </span>
                  </div>
                </div>
                <ul className="mt-6 space-y-3.5">
                  {data.salesByCategory.map((c, i) => (
                    <li key={c.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-slate-800">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
                        />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="shrink-0 text-slate-500">
                        <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${CAT_PILL[i % CAT_PILL.length]}`}>
                          {c.percent.toFixed(2)}%
                        </span>
                        {" · "}
                        {formatKes(c.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-12">
        <div className="overflow-clip rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-white text-amber-700 shadow-sm">
                <svg className="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M10 2.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4L10 14.8 5.2 17.4l.9-5.4L2.2 8.2l5.4-.8z" />
                </svg>
              </span>
              <div>
                <h2 className="text-lg font-semibold text-amber-950">Top products</h2>
                <p className="text-sm text-slate-500">Units sold in the last {periodLabel}</p>
              </div>
            </div>
            <Link href="/inventory" className="text-sm font-medium text-indigo-700 hover:underline">
              View all
            </Link>
          </div>
          {!data.topProducts.length ? (
            <p className="px-6 py-14 text-center text-sm text-slate-500">No products sold yet</p>
          ) : (
            <ul className="divide-y divide-slate-100 px-6 pb-2">
              {data.topProducts.map((p, i) => {
                const tone = RANK_TONES[i % RANK_TONES.length];
                const catIdx = data.salesByCategory.findIndex((c) => c.name === p.category);
                const pct = Math.round((p.sold / maxSold) * 1000) / 10;
                return (
                  <li key={p.id} className="flex items-center gap-4 py-3.5">
                    <span className="w-4 text-sm text-slate-400">{i + 1}</span>
                    <span
                      className={`grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl text-xs font-bold ${tone.avatar}`}
                    >
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        initials(p.name)
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{p.name}</p>
                      <span
                        className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          catIdx >= 0 ? CAT_PILL[catIdx % CAT_PILL.length] : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {p.category}
                      </span>
                    </div>
                    <div className="hidden w-48 md:block">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="w-24 text-right">
                      <span className={`inline-block rounded-lg px-2.5 py-1 font-semibold ${tone.sold}`}>
                        {p.sold % 1 === 0 ? p.sold : p.sold.toFixed(1)}
                      </span>{" "}
                      <span className="text-sm text-slate-500">sold</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="overflow-clip rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 xl:col-span-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
                <svg className="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <circle cx="10" cy="10" r="7" />
                  <path d="M10 6.5v4M10 13.5h.01" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Needs attention</h2>
                <p className="text-sm text-slate-500">Stock, receivables and refunds</p>
              </div>
            </div>
          </div>
          <ul className="divide-y divide-slate-100">
            <li className="flex items-center gap-4 px-6 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                <svg className="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M10 2.5l6.5 2.5v5c0 4-3 6.5-6.5 7.5C6.5 16.5 3.5 14 3.5 10V5z" />
                  <path d="M7 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">Low stock</p>
                <p className="text-sm text-slate-500">
                  {lowClear
                    ? "All stock above reorder levels"
                    : `${data.lowStockCount || data.lowStock.length} product${
                        (data.lowStockCount || data.lowStock.length) === 1 ? "" : "s"
                      } below reorder`}
                </p>
              </div>
              {lowClear ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  All clear
                </span>
              ) : (
                <Link
                  href="/inventory?belowReorder=1"
                  className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-200"
                >
                  Review
                </Link>
              )}
            </li>
            <li className="flex items-center gap-4 px-6 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <svg className="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M3 6.5A1.5 1.5 0 014.5 5H16v11H4.5A1.5 1.5 0 013 14.5z" />
                  <path d="M13 5V3.5H5" strokeLinecap="round" />
                  <circle cx="13.5" cy="10.5" r="1" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">Receivables</p>
                <p className="text-sm text-slate-500">
                  {data.openReceivables > 0
                    ? `${data.openReceivables} customer${data.openReceivables === 1 ? "" : "s"} owing`
                    : "No customers owing"}
                </p>
              </div>
              {data.openReceivables > 0 ? (
                <Link
                  href="/receivables"
                  className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-200"
                >
                  Review
                </Link>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  Clear
                </span>
              )}
            </li>
            <li className="flex items-center gap-4 px-6 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-700">
                <svg className="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M7 4L3.5 7.5 7 11" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3.5 7.5H12a4.5 4.5 0 010 9H8" strokeLinecap="round" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">Refund requests</p>
                <p className="text-sm text-slate-500">
                  {data.pendingRefunds > 0
                    ? `${data.pendingRefunds} pending request${data.pendingRefunds === 1 ? "" : "s"}`
                    : "No pending requests"}
                </p>
              </div>
              {data.pendingRefunds > 0 ? (
                <Link
                  href="/refunds"
                  className="rounded-lg bg-sky-100 px-3 py-1.5 text-sm font-semibold text-sky-900 hover:bg-sky-200"
                >
                  Review
                </Link>
              ) : (
                <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/20">
                  None
                </span>
              )}
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
