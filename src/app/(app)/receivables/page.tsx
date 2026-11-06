"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatKes } from "@/lib/money";
import { toCsv } from "@/lib/csv";

type Aging = {
  current: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
};

type Charge = {
  saleId: string;
  receiptNo: number;
  completedAt: string;
  dueAt?: string | null;
  openAmount: number;
  ageDays: number;
  isOverdue?: boolean;
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  openReceipts: number;
  aging: Aging;
  charges: Charge[];
};

type Summary = {
  owed: number;
  overdue: number;
  overdueReceipts?: number;
  debtors: number;
  openReceipts: number;
  aging: Aging;
};

function moneyCell(n: number, blankZero = true) {
  if (blankZero && !n) return "";
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Oldest overdue due date; blank when nothing is past due (Stockflow). */
function oldestLabel(charges: Charge[]) {
  const overdue = charges.filter((c) => c.isOverdue || (c.dueAt && new Date(c.dueAt) < new Date()));
  if (!overdue.length) return "";
  const oldest = [...overdue].sort((a, b) => {
    const da = a.dueAt ? new Date(a.dueAt).getTime() : new Date(a.completedAt).getTime();
    const db = b.dueAt ? new Date(b.dueAt).getTime() : new Date(b.completedAt).getTime();
    return da - db;
  })[0];
  const d = oldest.dueAt || oldest.completedAt;
  return new Date(d).toLocaleDateString("en-KE");
}

function IconDownload({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  );
}

const AVATAR_TONES = [
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-800",
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function avatarTone(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
  return AVATAR_TONES[h];
}

function AvatarStack({ people }: { people: Customer[] }) {
  if (!people.length) {
    return <span className="text-xs text-slate-400">None</span>;
  }
  return (
    <div className="flex items-center -space-x-2">
      {people.slice(0, 3).map((p) => (
        <span
          key={p.id}
          title={p.name}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold ${avatarTone(p.id)}`}
        >
          {initials(p.name)}
        </span>
      ))}
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  icon,
  iconClass,
  valueClass = "text-2xl text-slate-900",
  people,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  iconClass: string;
  valueClass?: string;
  people: Customer[];
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white ${iconClass}`}
        >
          {icon}
        </span>
      </div>
      <h2 className="text-sm font-medium text-slate-500">{title}</h2>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className={`font-semibold tracking-tight tabular-nums ${valueClass}`}>{value}</h3>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <AvatarStack people={people} />
      </div>
    </div>
  );
}

export default function ReceivablesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await fetch("/api/receivables").then((r) => r.json());
    setCustomers(Array.isArray(data.customers) ? data.customers : []);
    setSummary(data.summary || null);
    setAsOf(data.asOf || null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    return customers.reduce(
      (acc, c) => ({
        current: acc.current + c.aging.current,
        d31_60: acc.d31_60 + c.aging.d31_60,
        d61_90: acc.d61_90 + c.aging.d61_90,
        d90_plus: acc.d90_plus + c.aging.d90_plus,
        balance: acc.balance + c.balance,
        receipts: acc.receipts + c.openReceipts,
      }),
      { current: 0, d31_60: 0, d61_90: 0, d90_plus: 0, balance: 0, receipts: 0 }
    );
  }, [customers]);

  function exportCsv() {
    const rows = customers.map((c) => ({
      customer: c.name,
      phone: c.phone || "",
      d0_30: c.aging.current,
      d31_60: c.aging.d31_60,
      d61_90: c.aging.d61_90,
      d90_plus: c.aging.d90_plus,
      total: c.balance,
      receipts: c.openReceipts,
      oldest: oldestLabel(c.charges),
    }));
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receivables-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const overdueReceipts = summary?.overdueReceipts ?? 0;
  const overdueDebtors = useMemo(
    () =>
      customers.filter((c) =>
        c.charges.some((ch) => ch.isOverdue || (ch.dueAt && new Date(ch.dueAt) < new Date()))
      ),
    [customers]
  );
  const topDebtors = useMemo(
    () => [...customers].sort((a, b) => b.balance - a.balance).slice(0, 3),
    [customers]
  );
  const asOfLabel = asOf
    ? new Date(asOf).toLocaleString("en-KE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "—";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Receivables</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            How old the money owed to you is, customer by customer. Revenue counts when you sell;
            this page counts what is still unpaid.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          disabled={!customers.length}
          onClick={exportCsv}
        >
          <IconDownload className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Owed to you"
          value={formatKes(summary?.owed || 0)}
          hint={`${summary?.openReceipts || 0} open receipt${
            (summary?.openReceipts || 0) === 1 ? "" : "s"
          }`}
          iconClass="text-slate-700"
          people={topDebtors}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
            </svg>
          }
        />
        <StatCard
          title="Overdue"
          value={formatKes(summary?.overdue || 0)}
          hint={`${overdueReceipts} receipt${overdueReceipts === 1 ? "" : "s"} past due`}
          iconClass="text-rose-600"
          valueClass={
            (summary?.overdue || 0) > 0 ? "text-2xl text-rose-600" : "text-2xl text-rose-300"
          }
          people={overdueDebtors}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          }
        />
        <StatCard
          title="Debtors"
          value={String(summary?.debtors || 0)}
          hint="customers carrying a balance"
          iconClass="text-teal-700"
          people={customers}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <StatCard
          title="As of"
          value={asOfLabel}
          hint="aging recomputed on every load"
          iconClass="text-sky-700"
          valueClass="text-lg text-slate-900"
          people={[]}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          }
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Aging by customer</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Each receipt is aged from its due date. The first column also holds debt that is not due
            yet, because a fresh debt is not a separate bucket.
          </p>
        </div>

        {loading ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">Loading receivables…</p>
        ) : !customers.length ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            <p>Nothing outstanding.</p>
            <p className="mt-2">
              To create data:{" "}
              <Link href="/customers" className="sf-link">
                add a customer
              </Link>{" "}
              → POS → charge with Credit.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 text-right font-medium">0 to 30 days (KSh)</th>
                  <th className="px-5 py-3 text-right font-medium">31 to 60 days (KSh)</th>
                  <th className="px-5 py-3 text-right font-medium">61 to 90 days (KSh)</th>
                  <th className="px-5 py-3 text-right font-medium">Over 90 days (KSh)</th>
                  <th className="px-5 py-3 text-right font-medium">Total (KSh)</th>
                  <th className="px-5 py-3 text-right font-medium">Receipts</th>
                  <th className="px-5 py-3 font-medium">Oldest</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-semibold text-slate-900 hover:text-[var(--sf-brand)] hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">
                      {moneyCell(c.aging.current)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">
                      {moneyCell(c.aging.d31_60)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">
                      {moneyCell(c.aging.d61_90)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-rose-700">
                      {moneyCell(c.aging.d90_plus)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-900">
                      {moneyCell(c.balance, false)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">
                      {c.openReceipts || ""}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{oldestLabel(c.charges)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td className="px-5 py-3.5">Totals</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
                    {moneyCell(totals.current, false)}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
                    {moneyCell(totals.d31_60, false)}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
                    {moneyCell(totals.d61_90, false)}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
                    {moneyCell(totals.d90_plus, false)}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
                    {moneyCell(totals.balance, false)}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{totals.receipts}</td>
                  <td className="px-5 py-3.5" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
