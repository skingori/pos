"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatKes, formatMoneyParts } from "@/lib/money";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Days = 7 | 30 | 90;

type Overview = {
  days: number;
  salesToday: number;
  salesTodayChange: number;
  profitToday: number;
  profitTodayChange: number;
  grossMarginPct: number;
  rangeMarginPct: number;
  transactionsToday: number;
  avgBasket: number;
  avgBasketChange: number;
  stockValue: number;
  skuCount: number;
  cashInDrawer: number | null;
  registerLabel: string | null;
  receivablesTotal: number;
  openReceivables: number;
  pendingRefunds: number;
  heldSales: number;
  lowStockCount: number;
  outOfStock: number;
  rangeTotal: number;
  prevRangeTotal: number;
  rangeTotalChange: number;
  dailyAverage: number;
  bestDay: { label: string; sales: number };
  ageing: { d0_30: number; d31_60: number; d60plus: number };
  paymentMix: { name: string; amount: number; share: number }[];
  topDebtors: { id: string; name: string; owed: number; days: number }[];
  lowStock: {
    id: string;
    name: string;
    qty: number;
    reorderLevel: number;
    unit: string;
    imageUrl: string | null;
    category: string;
  }[];
  salesTrend: { date: string; label: string; sales: number; previous: number }[];
  salesByCategory: { name: string; revenue: number; percent: number }[];
  topProducts: {
    id: string;
    name: string;
    sold: number;
    revenue: number;
    margin: number;
    imageUrl: string | null;
    category: string;
  }[];
};

const CAT_COLORS = [
  "#0f172a",
  "#10b981",
  "#64748b",
  "#f59e0b",
  "#ea580c",
  "#0ea5e9",
  "#94a3b8",
];
const MIX_COLORS: Record<string, string> = {
  Cash: "#64748b",
  "M-Pesa": "#10b981",
  "Credit account": "#f59e0b",
  "Card / bank": "#0ea5e9",
};

function shortKes(n: number) {
  if (n >= 1_000_000) return `KSh ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `KSh ${Math.round(n / 1000)}k`;
  return formatKes(n);
}

function MoneyValue({
  amount,
  size = "md",
  tone = "brand",
}: {
  amount: number;
  size?: "sm" | "md" | "lg";
  tone?: "brand" | "amber";
}) {
  const parts = formatMoneyParts(amount);
  const sizeCls =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-[14px]" : "text-lg";
  const fracCls = size === "lg" ? "text-base" : "text-[11px]";
  const toneCls = tone === "amber" ? "text-amber-600" : "text-[var(--sf-brand)]";
  const fracTone = tone === "amber" ? "text-amber-400" : "text-slate-400";
  return (
    <p className={`truncate font-mono font-extrabold tracking-tight ${sizeCls} ${toneCls}`}>
      <span className="mr-1 font-sans text-[10px] font-medium text-slate-400">KSh</span>
      {parts.whole}
      <span className={`${fracCls} ${fracTone}`}>.{parts.frac}</span>
    </p>
  );
}

function ChangePill({
  value,
  label = "vs yesterday",
  invert = false,
}: {
  value: number;
  label?: string;
  invert?: boolean;
}) {
  const up = invert ? value <= 0 : value >= 0;
  const flat = Math.abs(value) < 0.05;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        flat
          ? "bg-slate-100 text-slate-600"
          : up
            ? "bg-emerald-50 text-emerald-700"
            : "bg-rose-50 text-rose-700"
      }`}
    >
      {flat ? "—" : value > 0 ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
      <span className="font-medium opacity-70">{label}</span>
    </span>
  );
}

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data.map(
    (v, i) =>
      `${2 + (i / (data.length - 1)) * 96},${20 - ((v - min) / (max - min || 1)) * 14}`
  );
  return (
    <svg
      viewBox="0 0 100 24"
      className="h-6 w-16 shrink-0 overflow-hidden"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CardIcon({ kind }: { kind: "stock" | "chart" }) {
  const path =
    kind === "stock"
      ? "M3.5 8 12 4l8.5 4v8L12 20l-8.5-4zM3.5 8 12 12l8.5-4M12 12v8"
      : "M4 19V5M4 19h16M8 15l3-4 3 2 4-6";
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden>
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Card({
  title,
  sub,
  icon,
  action,
  children,
}: {
  title: string;
  sub?: string;
  icon?: "stock" | "chart";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--sf-border)] bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[var(--sf-accent-soft)] text-[var(--sf-accent-deep)]">
              <CardIcon kind={icon} />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="sf-display text-[13px] font-bold text-[var(--sf-brand)]">{title}</h2>
            {sub ? <p className="truncate text-[11px] text-[var(--sf-muted)]">{sub}</p> : null}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function CategoryDonut({
  items,
  center,
}: {
  items: { name: string; share: number; color: string }[];
  center: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const label =
    active === null
      ? "Total"
      : items[active].name.length > 16
        ? `${items[active].name.slice(0, 15)}…`
        : items[active].name;

  return (
    <svg viewBox="0 0 140 140" className="mx-auto h-32 w-32" aria-hidden>
      <g transform="rotate(-90 70 70)">
        {items.map((it, i) => {
          const len = (it.share / 100) * C;
          const el = (
            <circle
              key={it.name}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={it.color}
              strokeWidth={active === i ? 18 : 14}
              strokeDasharray={`${Math.max(len - 2.5, 0)} ${C}`}
              strokeDashoffset={-offset}
              style={{
                transition: "stroke-width 150ms, opacity 150ms",
                opacity: active === null || active === i ? 1 : 0.35,
                cursor: "pointer",
              }}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          );
          offset += len;
          return el;
        })}
      </g>
      <text x="70" y="66" textAnchor="middle" fontSize="9" fill="#64748b">
        {label}
      </text>
      <text
        x="70"
        y="86"
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        fill="#0f172a"
        fontFamily="var(--font-mono), ui-monospace, monospace"
      >
        {active === null ? center : `${items[active].share}%`}
      </text>
    </svg>
  );
}

function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200/60 bg-slate-100 p-1 text-xs font-semibold">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 transition ${
            value === o.value
              ? "bg-white text-[var(--sf-brand)] shadow-sm"
              : "text-slate-600 hover:text-[var(--sf-brand)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [days, setDays] = useState<Days>(7);
  const [sortKey, setSortKey] = useState<"revenue" | "sold">("revenue");
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

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-KE", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    []
  );

  const topProducts = useMemo(() => {
    if (!data) return [];
    return [...data.topProducts].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [data, sortKey]);

  const maxBar = useMemo(
    () => Math.max(1, ...topProducts.map((p) => p[sortKey])),
    [topProducts, sortKey]
  );

  if (!data && loading) {
    return <p className="py-16 text-center text-sm text-slate-500">Loading dashboard…</p>;
  }
  if (!data) {
    return <p className="py-16 text-center text-sm text-rose-600">Could not load overview</p>;
  }

  const salesSpark = data.salesTrend.map((d) => d.sales);
  const marginFactor = data.grossMarginPct / 100;
  const overdue = data.ageing.d31_60 + data.ageing.d60plus;
  const cash = data.cashInDrawer ?? 0;
  const catTotal = data.salesByCategory.reduce((s, c) => s + c.revenue, 0);
  const rangeProfit = data.rangeTotal * (data.rangeMarginPct / 100);

  const kpis = [
    {
      label: "Sales today",
      amount: data.salesToday,
      compact: false,
      note: `${data.transactionsToday} orders`,
      change: data.salesTodayChange as number | null,
      changeLabel: "vs yesterday",
      color: "#0f172a",
      spark: salesSpark,
      tone: "brand" as const,
    },
    {
      label: "Gross profit",
      amount: data.profitToday,
      compact: false,
      note: `${data.grossMarginPct.toFixed(1)}% margin`,
      change: data.profitTodayChange as number | null,
      changeLabel: "vs yesterday",
      color: "#10b981",
      spark: salesSpark.map((v) => v * marginFactor),
      tone: "brand" as const,
    },
    {
      label: "Avg. basket",
      amount: data.avgBasket,
      compact: false,
      note: "per receipt",
      change: data.avgBasketChange as number | null,
      changeLabel: "vs yesterday",
      color: "#0ea5e9",
      spark: salesSpark.map((v, i) => {
        const prev = data.salesTrend[i]?.previous || v;
        return prev > 0
          ? v / Math.max(1, Math.round(prev / Math.max(data.avgBasket, 1)))
          : data.avgBasket;
      }),
      tone: "brand" as const,
    },
    {
      label: "Stock value",
      amount: data.stockValue,
      compact: true,
      note: `at cost · ${data.skuCount.toLocaleString()} SKUs`,
      change: null as number | null,
      changeLabel: "vs last week",
      color: "#64748b",
      spark: salesSpark.map(
        (_, i) => data.stockValue * (0.97 + (i / Math.max(salesSpark.length - 1, 1)) * 0.03)
      ),
      tone: "brand" as const,
    },
    {
      label: "Receivables",
      amount: data.receivablesTotal,
      compact: false,
      note: overdue > 0 ? `${formatKes(overdue)} overdue` : `${data.openReceivables} accounts`,
      change: null as number | null,
      changeLabel: "vs last week",
      color: "#f59e0b",
      spark: salesSpark.map(
        (_, i) => data.receivablesTotal * (0.9 + (i / Math.max(salesSpark.length - 1, 1)) * 0.1)
      ),
      tone: "amber" as const,
    },
    {
      label: "Cash in drawer",
      amount: data.cashInDrawer,
      compact: false,
      note: data.registerLabel || "No open register",
      change: null as number | null,
      changeLabel: "",
      color: "#ea580c",
      spark: salesSpark.map((_, i) => (cash || 1) * ((i + 1) / salesSpark.length)),
      tone: "brand" as const,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="sf-display text-xl font-extrabold tracking-tight text-[var(--sf-brand)] sm:text-2xl">
              {todayLabel}
            </h1>
            {data.registerLabel ? (
              <span className="rounded-md bg-[var(--sf-accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--sf-accent-deep)]">
                Register open
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-[var(--sf-muted)]">
            Sales, profit, stock and credit at a glance
          </p>
        </div>
        <Link
          href="/pos"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[var(--sf-accent)] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[var(--sf-accent-deep)]"
        >
          Make a Sale
          <kbd className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-white/90">
            F2
          </kbd>
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="min-w-0 overflow-hidden rounded-xl border border-[var(--sf-border)] bg-white p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-1 overflow-hidden">
              <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                {k.label}
              </span>
              <Spark data={k.spark} color={k.color} />
            </div>
            <div className="mt-1.5 min-w-0">
              {k.amount == null ? (
                <p className="font-mono text-lg font-extrabold text-[var(--sf-brand)]">—</p>
              ) : k.compact ? (
                <p className="truncate font-mono text-lg font-extrabold tracking-tight text-[var(--sf-brand)]">
                  {shortKes(k.amount)}
                </p>
              ) : (
                <MoneyValue amount={k.amount} size="sm" tone={k.tone} />
              )}
            </div>
            <p className="mt-0.5 truncate text-[10px] text-[var(--sf-muted)]">{k.note}</p>
            {k.change != null ? (
              <div className="mt-1.5">
                <ChangePill value={k.change} label={k.changeLabel} />
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <section className="grid gap-2.5 lg:grid-cols-[1.7fr_1fr]">
        <Card
          title="Sales trend"
          sub={`Last ${days} days vs previous ${days}`}
          icon="chart"
          action={
            <Segmented
              value={days}
              onChange={setDays}
              options={[
                { value: 7 as Days, label: "7 days" },
                { value: 30 as Days, label: "30 days" },
                { value: 90 as Days, label: "90 days" },
              ]}
            />
          }
        >
          <div className="grid grid-cols-2 border-b border-slate-100 sm:grid-cols-4">
            {[
              {
                label: "Total",
                amount: data.rangeTotal,
                extra: <ChangePill value={data.rangeTotalChange} label="vs prev." />,
              },
              { label: "Daily average", amount: data.dailyAverage, extra: null },
              {
                label: "Best day",
                amount: data.bestDay.sales,
                extra: (
                  <span className="text-[11px] text-[var(--sf-muted)]">{data.bestDay.label}</span>
                ),
              },
              {
                label: "Gross profit",
                amount: rangeProfit,
                extra: (
                  <span className="text-[11px] text-[var(--sf-muted)]">
                    {data.rangeMarginPct.toFixed(1)}% margin
                  </span>
                ),
              },
            ].map((s) => (
              <div key={s.label} className="min-w-0 border-r border-slate-100 px-3 py-2 last:border-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                  {s.label}
                </p>
                <div className="mt-0.5 min-w-0">
                  <MoneyValue amount={s.amount} size="sm" />
                </div>
                <div className="mt-1 min-h-4">{s.extra}</div>
              </div>
            ))}
          </div>
          <div className="h-36 w-full px-2 pt-1.5 pb-1 sm:h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.salesTrend} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="sfTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ea580c" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#ea580c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#eef0f4" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--sf-border)",
                    fontSize: 12,
                  }}
                  formatter={(v, name) => [
                    formatKes(Number(v ?? 0)),
                    name === "previous" ? "Previous" : "This period",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="previous"
                  stroke="#cbd5e1"
                  strokeDasharray="5 5"
                  fill="transparent"
                  strokeWidth={1.6}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#ea580c"
                  fill="url(#sfTrend)"
                  strokeWidth={2.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 px-3.5 pb-2.5 text-[10px] text-[var(--sf-muted)]">
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-5 bg-[var(--sf-accent)]" /> This period
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-5 border-t-2 border-dashed border-slate-300" /> Previous
            </span>
          </div>
        </Card>

        <Card title="Sales by category" sub={`Last ${days} days`} icon="stock">
          <div className="p-3">
            {data.salesByCategory.length > 0 ? (
              <CategoryDonut
                center={shortKes(catTotal)}
                items={data.salesByCategory.map((c, i) => ({
                  name: c.name,
                  share: c.percent,
                  color: CAT_COLORS[i % CAT_COLORS.length],
                }))}
              />
            ) : (
              <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full border-[12px] border-slate-100">
                <div className="text-center">
                  <p className="text-[10px] text-slate-400">Total</p>
                  <p className="font-mono text-sm font-bold text-[var(--sf-brand)]">KSh 0</p>
                </div>
              </div>
            )}
            <ul className="mt-3 space-y-1.5">
              {data.salesByCategory.map((c, i) => {
                const amount = c.revenue >= 100_000 ? shortKes(c.revenue) : formatKes(c.revenue);
                return (
                  <li
                    key={c.name}
                    className="grid grid-cols-[minmax(0,1fr)_2.25rem_5.5rem] items-center gap-x-1.5 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-slate-600">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
                      />
                      <span className="truncate" title={c.name}>
                        {c.name}
                      </span>
                    </span>
                    <span className="text-right font-mono text-xs font-bold tabular-nums text-[var(--sf-brand)]">
                      {c.percent}%
                    </span>
                    <span
                      className="truncate text-right font-mono text-xs tabular-nums text-slate-400"
                      title={formatKes(c.revenue)}
                    >
                      {amount}
                    </span>
                  </li>
                );
              })}
              {data.salesByCategory.length === 0 ? (
                <li className="text-center text-xs text-slate-400">No sales in this period</li>
              ) : null}
            </ul>
          </div>
        </Card>
      </section>

      <section className="grid gap-2.5 lg:grid-cols-3">
        <Card title="Payment mix" sub="Today's takings by method">
          <div className="p-3">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100">
              {data.paymentMix.map((m) => (
                <div
                  key={m.name}
                  style={{
                    width: `${m.share}%`,
                    background: MIX_COLORS[m.name] || "#64748b",
                  }}
                  title={`${m.name} ${m.share}%`}
                />
              ))}
            </div>
            <ul className="mt-5 space-y-3">
              {data.paymentMix.map((m) => (
                <li key={m.name} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: MIX_COLORS[m.name] || "#64748b" }}
                    />
                    {m.name}
                  </span>
                  <span className="font-mono text-xs">
                    <b className="text-[var(--sf-brand)]">{formatKes(m.amount)}</b>
                    <span className="ml-2 text-slate-400">{m.share}%</span>
                  </span>
                </li>
              ))}
              {data.paymentMix.length === 0 ? (
                <li className="text-center text-xs text-slate-400">No payments today</li>
              ) : null}
            </ul>
          </div>
        </Card>

        <Card
          title="Receivables ageing"
          sub="Customer credit owed"
          action={
            <Link
              href="/reports?tab=receivables"
              className="text-xs font-bold text-amber-600 hover:underline"
            >
              AR aging
            </Link>
          }
        >
          <div className="p-3">
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[
                { label: "0–30 days", value: data.ageing.d0_30, tone: "text-emerald-700 bg-emerald-50" },
                { label: "31–60", value: data.ageing.d31_60, tone: "text-amber-700 bg-amber-50" },
                { label: "60+", value: data.ageing.d60plus, tone: "text-rose-700 bg-rose-50" },
              ].map((b) => (
                <div key={b.label} className={`rounded-lg p-2 ${b.tone}`}>
                  <p className="text-[9px] font-extrabold uppercase tracking-wider">{b.label}</p>
                  <p className="mt-0.5 font-mono text-[11px] font-bold">
                    {shortKes(b.value).replace("KSh ", "")}
                  </p>
                </div>
              ))}
            </div>
            <ul className="mt-2 divide-y divide-slate-100">
              {data.topDebtors.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/customers/${d.id}`}
                    className="flex items-center justify-between py-1.5 text-xs hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--sf-brand)]">{d.name}</p>
                      <p
                        className={`text-xs ${
                          d.days > 60 ? "font-semibold text-rose-600" : "text-[var(--sf-muted)]"
                        }`}
                      >
                        {d.days} days outstanding
                      </p>
                    </div>
                    <span className="shrink-0 font-mono font-bold text-amber-600">
                      {formatKes(d.owed)}
                    </span>
                  </Link>
                </li>
              ))}
              {data.topDebtors.length === 0 ? (
                <li className="py-6 text-center text-xs text-slate-400">No open receivables</li>
              ) : null}
            </ul>
          </div>
        </Card>

        <Card title="Operations" sub="Holds, stock and refunds">
          <ul className="divide-y divide-slate-100">
            {[
              {
                title: "Held sales",
                note:
                  data.heldSales > 0
                    ? `${data.heldSales} pending restore`
                    : "No held carts",
                href: "/pos",
                cta: data.heldSales > 0 ? "Open POS" : "None",
                tone:
                  data.heldSales > 0
                    ? "bg-[var(--sf-accent-soft)] text-[var(--sf-accent-deep)]"
                    : "bg-slate-100 text-slate-500",
              },
              {
                title: "Low stock",
                note:
                  data.lowStockCount > 0
                    ? `${data.lowStockCount} below reorder · ${data.outOfStock} out`
                    : "All stock healthy",
                href: "/inventory",
                cta: data.lowStockCount > 0 ? "Review" : "None",
                tone:
                  data.lowStockCount > 0
                    ? "bg-amber-50 text-amber-800"
                    : "bg-slate-100 text-slate-500",
              },
              {
                title: "Customer balances",
                note: `${data.openReceivables} accounts · ${formatKes(data.receivablesTotal)}`,
                href: "/customers?filter=owing",
                cta: data.openReceivables > 0 ? "Collect" : "None",
                tone:
                  data.openReceivables > 0
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-500",
              },
              {
                title: "Refund requests",
                note:
                  data.pendingRefunds > 0
                    ? `${data.pendingRefunds} awaiting approval`
                    : "No pending requests",
                href: "/refunds",
                cta: data.pendingRefunds > 0 ? "Review" : "None",
                tone:
                  data.pendingRefunds > 0
                    ? "bg-rose-50 text-rose-700"
                    : "bg-slate-100 text-slate-500",
              },
            ].map((row) => (
              <li key={row.title} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-[var(--sf-brand)]">{row.title}</p>
                  <p className="truncate text-xs text-[var(--sf-muted)]">{row.note}</p>
                </div>
                {row.cta === "None" ? (
                  <span className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${row.tone}`}>
                    None
                  </span>
                ) : (
                  <Link
                    href={row.href}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition hover:opacity-90 ${row.tone}`}
                  >
                    {row.cta}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="grid gap-2.5 lg:grid-cols-[1.3fr_1fr]">
        <Card
          title="Top products"
          sub={`Last ${days} days`}
          action={
            <Segmented
              value={sortKey}
              onChange={setSortKey}
              options={[
                { value: "revenue" as const, label: "Revenue" },
                { value: "sold" as const, label: "Units" },
              ]}
            />
          }
        >
          <div className="grid grid-cols-[28px_1fr_96px_64px_56px] items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--sf-muted)]">
            <span>#</span>
            <span>Product</span>
            <span className="text-right">Revenue</span>
            <span className="text-right">Units</span>
            <span className="text-right">Margin</span>
          </div>
          {topProducts.map((p, i) => {
            const color = CAT_COLORS[i % CAT_COLORS.length];
            return (
              <div
                key={p.id}
                className="grid grid-cols-[28px_1fr_96px_64px_56px] items-center gap-3 border-b border-slate-50 px-5 py-3 last:border-0"
              >
                <span className="text-xs text-slate-400">{i + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-[var(--sf-brand)]">{p.name}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: `${color}1a`, color }}
                    >
                      {p.category}
                    </span>
                    <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(p[sortKey] / maxBar) * 100}%`,
                          background: color,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <span className="text-right font-mono text-xs font-bold text-[var(--sf-brand)]">
                  {formatKes(p.revenue)}
                </span>
                <span className="text-right font-mono text-xs text-slate-600">{p.sold}</span>
                <span
                  className={`text-right font-mono text-xs font-bold ${
                    p.margin < 15 ? "text-amber-700" : "text-emerald-700"
                  }`}
                >
                  {p.margin}%
                </span>
              </div>
            );
          })}
          {topProducts.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-slate-400">No product sales yet</p>
          ) : null}
        </Card>

        <Card
          title="Low stock & reorder"
          sub={
            data.lowStock.length
              ? `${data.lowStock.length} products below reorder level`
              : "All products above reorder level"
          }
          action={
            <Link
              href="/inventory"
              className="inline-flex items-center rounded-lg border border-[var(--sf-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--sf-brand)] shadow-sm hover:bg-[var(--sf-surface-2)]"
            >
              Inventory
            </Link>
          }
        >
          <ul className="divide-y divide-slate-100">
            {data.lowStock.map((p) => {
              const ratio = Math.min(p.qty / Math.max(p.reorderLevel, 1), 1);
              const out = p.qty <= 0;
              return (
                <li key={p.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[var(--sf-brand)]">{p.name}</p>
                      <p className="text-xs text-slate-400">
                        {p.category} · reorder {p.reorderLevel} {p.unit}
                      </p>
                    </div>
                    <Link
                      href="/inventory"
                      className="shrink-0 rounded-lg border border-[var(--sf-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--sf-brand)] shadow-sm hover:bg-[var(--sf-surface-2)]"
                    >
                      Reorder
                    </Link>
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(ratio * 100, 3)}%`,
                          background: out ? "#e11d48" : ratio < 0.4 ? "#f59e0b" : "#0f172a",
                        }}
                      />
                    </div>
                    <span
                      className={`font-mono text-[11px] font-bold ${
                        out ? "text-rose-600" : "text-slate-600"
                      }`}
                    >
                      {out ? "Out of stock" : `${p.qty} / ${p.reorderLevel}`}
                    </span>
                  </div>
                </li>
              );
            })}
            {data.lowStock.length === 0 ? (
              <li className="px-5 py-10 text-center text-xs text-slate-400">
                Nothing needs reordering
              </li>
            ) : null}
          </ul>
        </Card>
      </section>
    </div>
  );
}
