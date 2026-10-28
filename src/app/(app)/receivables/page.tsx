"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatKes } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import { useSession } from "next-auth/react";
import { canSellCredit } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";

type Aging = {
  current: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
};

type Charge = {
  saleId: string;
  receiptNo: number;
  customerId: string;
  customerName: string;
  completedAt: string;
  originalCredit: number;
  openAmount: number;
  ageDays: number;
  bucket: string;
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  creditLimit: number;
  openReceipts: number;
  aging: Aging;
  charges: Charge[];
};

type Payment = {
  id: string;
  amount: number;
  method: string;
  note: string | null;
  createdAt: string;
  customer: { name: string };
};

type Summary = {
  owed: number;
  overdue: number;
  debtors: number;
  openReceipts: number;
  aging: Aging;
};

export default function ReceivablesPage() {
  const { data: session } = useSession();
  const canPay = session?.user?.role && canSellCredit(session.user.role as Role);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHow, setShowHow] = useState(true);

  async function load() {
    setLoading(true);
    const data = await fetch("/api/receivables").then((r) => r.json());
    setCustomers(Array.isArray(data.customers) ? data.customers : []);
    setPayments(Array.isArray(data.payments) ? data.payments : []);
    setSummary(data.summary || null);
    setAsOf(data.asOf || null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.phone || "").toLowerCase().includes(term)
    );
  }, [customers, q]);

  const selected = customers.find((c) => c.id === customerId);

  async function collect() {
    setError("");
    if (!customerId) {
      setError("Select a customer");
      return;
    }
    if (!Number(amount) || Number(amount) <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/receivables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        amount: Number(amount),
        method,
        note: note || null,
      }),
    });
    setSaving(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setAmount("");
    setNote("");
    load();
  }

  function exportCsv() {
    const rows = filtered.flatMap((c) =>
      c.charges.length
        ? c.charges.map((ch) => ({
            customer: c.name,
            phone: c.phone || "",
            balance: c.balance,
            credit_limit: c.creditLimit,
            receipt: ch.receiptNo,
            sale_date: ch.completedAt,
            age_days: ch.ageDays,
            open_amount: ch.openAmount,
            bucket: ch.bucket,
          }))
        : [
            {
              customer: c.name,
              phone: c.phone || "",
              balance: c.balance,
              credit_limit: c.creditLimit,
              receipt: "",
              sale_date: "",
              age_days: "",
              open_amount: c.balance,
              bucket: "",
            },
          ]
    );
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receivables-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Receivables"
        description="How old the money owed to you is, customer by customer. Revenue counts when you sell; this page counts what is still unpaid."
        actions={
          <button
            type="button"
            className="sf-btn sf-btn-ghost"
            disabled={!customers.length}
            onClick={exportCsv}
          >
            Export CSV
          </button>
        }
      />

      <div className="sf-card border-teal-200/70 bg-gradient-to-br from-teal-50/80 to-white p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setShowHow((v) => !v)}
        >
          <div>
            <h2 className="font-semibold text-[var(--sf-brand)]">
              How data gets into Receivables
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Credit sales create balances. Collections reduce them.
            </p>
          </div>
          <span className="text-slate-400">{showHow ? "−" : "+"}</span>
        </button>

        {showHow && (
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-700">
            <li>
              <strong>Create a customer</strong> with a credit limit on{" "}
              <Link href="/customers" className="sf-link">
                Customers
              </Link>
              . Walk-in sales cannot go on credit.
            </li>
            <li>
              <strong>Sell on credit at POS</strong> — pick the customer, then use Credit (full or
              partial) when charging. Managers/admins only. That amount is added to the customer
              balance and shows here.
            </li>
            <li>
              <strong>Collect payment here</strong> — when they pay cash or M-Pesa against their
              debt, record it below. Balance drops; aging updates on the next load.
            </li>
            <li>
              <strong>Credit refunds</strong> also reduce balance (money owed goes down without
              cash leaving the till). Start from{" "}
              <Link href="/receipts" className="sf-link">
                Receipts
              </Link>
              .
            </li>
          </ol>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/customers" className="sf-btn sf-btn-ghost">
            + Customers
          </Link>
          <Link href="/pos" className="sf-btn sf-btn-accent">
            Open POS (credit sale)
          </Link>
          <Link href="/receipts" className="sf-btn sf-btn-ghost">
            Receipts
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sf-card sf-stat p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Owed to you
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--sf-brand)]">
            {formatKes(summary?.owed || 0)}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {summary?.openReceipts || 0} open credit receipt
            {(summary?.openReceipts || 0) === 1 ? "" : "s"}
          </p>
        </div>
        <div className="sf-card sf-stat p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Overdue (31+ days)
          </div>
          <div
            className={`mt-2 text-2xl font-semibold tracking-tight ${
              (summary?.overdue || 0) > 0 ? "text-rose-600" : "text-[var(--sf-brand)]"
            }`}
          >
            {formatKes(summary?.overdue || 0)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Aged from credit sale date</p>
        </div>
        <div className="sf-card sf-stat p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Debtors
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--sf-brand)]">
            {summary?.debtors || 0}
          </div>
          <p className="mt-1 text-xs text-slate-500">Customers with balance &gt; 0</p>
        </div>
        <div className="sf-card sf-stat p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            As of
          </div>
          <div className="mt-2 text-lg font-semibold tracking-tight text-[var(--sf-brand)]">
            {asOf ? new Date(asOf).toLocaleString("en-KE") : "—"}
          </div>
          <p className="mt-1 text-xs text-slate-500">Aging recomputed on every load</p>
        </div>
      </div>

      {summary && (
        <div className="grid gap-2 sm:grid-cols-4">
          {(
            [
              ["0–30 days", summary.aging.current],
              ["31–60 days", summary.aging.d31_60],
              ["61–90 days", summary.aging.d61_90],
              ["90+ days", summary.aging.d90_plus],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div className="text-xs text-slate-500">{label}</div>
              <div className="font-semibold tabular-nums">{formatKes(value)}</div>
            </div>
          ))}
        </div>
      )}

      {canPay && (
        <section className="sf-card p-5">
          <h2 className="font-semibold text-[var(--sf-brand)]">Collect payment</h2>
          <p className="mt-1 text-sm text-slate-500">
            Record cash or M-Pesa paid against a customer&apos;s outstanding balance.
          </p>
          {error && <p className="sf-alert sf-alert-error mt-3">{error}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-slate-500 sm:col-span-2">
              Customer
              <select
                className="sf-select mt-1"
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  const c = customers.find((x) => x.id === e.target.value);
                  if (c) setAmount(String(c.balance));
                }}
              >
                <option value="">Select debtor</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {formatKes(c.balance)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Amount
              <input
                className="sf-input mt-1"
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {selected && (
                <button
                  type="button"
                  className="mt-1 text-xs text-[var(--sf-accent-deep)] hover:underline"
                  onClick={() => setAmount(String(selected.balance))}
                >
                  Pay full {formatKes(selected.balance)}
                </button>
              )}
            </label>
            <label className="text-xs font-medium text-slate-500">
              Method
              <select
                className="sf-select mt-1"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="MPESA">M-Pesa</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500 sm:col-span-2">
              Note (optional)
              <input
                className="sf-input mt-1"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. M-Pesa ref"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={collect}
            disabled={saving || !customers.length}
            className="sf-btn sf-btn-primary mt-4"
          >
            {saving ? "Saving…" : "Record collection"}
          </button>
          {!customers.length && (
            <p className="mt-2 text-sm text-slate-500">
              No outstanding balances yet. Make a credit sale on POS first.
            </p>
          )}
        </section>
      )}

      <section className="sf-card overflow-hidden p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <div>
            <h2 className="font-semibold text-[var(--sf-brand)]">Aging by customer</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Each credit receipt is aged from its sale date. Collections are applied oldest-first.
            </p>
          </div>
          <label className="text-xs font-medium text-slate-500">
            Search
            <input
              className="sf-input mt-1 min-w-[200px]"
              placeholder="Customer or phone"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Loading receivables…</p>
        ) : !filtered.length ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            <p>Nothing outstanding. Every credit sale has been paid — or none yet.</p>
            <p className="mt-2">
              To create data: add a customer → POS → charge with Credit.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="sf-thead">
                <tr>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Phone</th>
                  <th className="px-3 py-2.5 text-right">Balance</th>
                  <th className="px-3 py-2.5 text-right">0–30</th>
                  <th className="px-3 py-2.5 text-right">31–60</th>
                  <th className="px-3 py-2.5 text-right">61–90</th>
                  <th className="px-3 py-2.5 text-right">90+</th>
                  <th className="px-3 py-2.5 text-right">Limit</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="sf-row">
                      <td className="px-3 py-2.5 font-medium">{c.name}</td>
                      <td className="px-3 py-2.5 text-slate-600">{c.phone || "-"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                        {formatKes(c.balance)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatKes(c.aging.current)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatKes(c.aging.d31_60)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatKes(c.aging.d61_90)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">
                        {formatKes(c.aging.d90_plus)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                        {formatKes(c.creditLimit)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          className="sf-link text-xs"
                          onClick={() =>
                            setExpanded((id) => (id === c.id ? null : c.id))
                          }
                        >
                          {expanded === c.id ? "Hide" : "Receipts"}
                        </button>
                      </td>
                    </tr>
                    {expanded === c.id && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={9} className="px-4 py-3">
                          {!c.charges.length ? (
                            <p className="text-sm text-slate-500">
                              Balance exists but no open credit receipts matched (check collections
                              history).
                            </p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead className="text-left text-slate-500">
                                <tr>
                                  <th className="pb-1 pr-3">Receipt</th>
                                  <th className="pb-1 pr-3">Sale date</th>
                                  <th className="pb-1 pr-3">Age</th>
                                  <th className="pb-1 pr-3 text-right">Original credit</th>
                                  <th className="pb-1 text-right">Still open</th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.charges.map((ch) => (
                                  <tr key={ch.saleId}>
                                    <td className="py-1 pr-3 font-medium">#{ch.receiptNo}</td>
                                    <td className="py-1 pr-3">
                                      {new Date(ch.completedAt).toLocaleDateString("en-KE")}
                                    </td>
                                    <td className="py-1 pr-3">{ch.ageDays}d</td>
                                    <td className="py-1 pr-3 text-right tabular-nums">
                                      {formatKes(ch.originalCredit)}
                                    </td>
                                    <td className="py-1 text-right tabular-nums font-medium">
                                      {formatKes(ch.openAmount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {canPay && (
                            <button
                              type="button"
                              className="sf-btn sf-btn-ghost mt-3 text-xs"
                              onClick={() => {
                                setCustomerId(c.id);
                                setAmount(String(c.balance));
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                            >
                              Collect from {c.name}
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sf-card p-5">
        <h2 className="font-semibold text-[var(--sf-brand)]">Recent collections</h2>
        <p className="mt-1 text-sm text-slate-500">
          Payments recorded on this page against customer balances.
        </p>
        {!payments.length ? (
          <p className="mt-4 text-sm text-slate-500">No collections recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <span className="font-medium">{p.customer.name}</span>
                  <span className="ml-2 text-slate-500">{p.method}</span>
                  {p.note && <span className="ml-2 text-xs text-slate-400">{p.note}</span>}
                </div>
                <div className="tabular-nums text-slate-700">
                  {formatKes(p.amount)} · {new Date(p.createdAt).toLocaleString("en-KE")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
