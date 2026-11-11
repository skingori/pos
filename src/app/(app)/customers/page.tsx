"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatKes, formatMoneyParts } from "@/lib/money";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  balance: number;
  active: boolean;
  createdAt?: string;
  priceLevelId?: string | null;
  priceLevel?: { id: string; name: string; discountPercent: number } | null;
  openReceipts: number;
  oldestOverdue: string | null;
  lastPayment: { at: string; amount: number } | null;
};

type PriceLevel = { id: string; name: string; discountPercent: number };
type QuickFilter = "all" | "active" | "inactive" | "owing" | "credit";
type FocusStat = "total" | "active" | "owing" | "credit";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function formatCreated(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading customers…</p>}>
      <CustomersInner />
    </Suspense>
  );
}

function CustomersInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("filter");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [levels, setLevels] = useState<PriceLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState<QuickFilter>(() =>
    filterParam === "owing" ? "owing" : "all"
  );
  const [focusStat, setFocusStat] = useState<FocusStat>(() =>
    filterParam === "owing" ? "owing" : "total"
  );
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<Customer | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    creditLimit: "0",
    storeCredit: "0",
    priceLevelId: "",
  });
  const [editOwes, setEditOwes] = useState(false);

  const ghostBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50";
  const primaryBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50";

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("inactive", "1");
    params.set("sort", "name");
    const [c, l] = await Promise.all([
      fetch(`/api/customers?${params}`).then((r) => r.json()),
      fetch("/api/price-levels")
        .then((r) => r.json())
        .catch(() => []),
    ]);
    setCustomers(Array.isArray(c) ? c : []);
    setLevels(Array.isArray(l) ? l : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (filterParam === "owing") {
      setQuick("owing");
      setFocusStat("owing");
    }
  }, [filterParam]);

  useEffect(() => {
    setPage(1);
  }, [q, quick, pageSize]);

  const stats = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => c.active).length;
    const inactive = total - active;
    const owingList = customers.filter((c) => c.balance > 0.009);
    const owing = owingList.length;
    const owed = owingList.reduce((s, c) => s + c.balance, 0);
    const onCredit = customers.filter((c) => c.creditLimit > 0.009).length;
    const creditCap = customers.reduce((s, c) => s + (c.creditLimit || 0), 0);
    const topDebtors = [...owingList]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 2)
      .map((c) => c.name);
    return { total, active, inactive, owing, owed, onCredit, creditCap, topDebtors };
  }, [customers]);

  const counts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let owing = 0;
    let credit = 0;
    for (const c of customers) {
      if (c.active) active += 1;
      else inactive += 1;
      if (c.balance > 0.009) owing += 1;
      if (c.creditLimit > 0.009) credit += 1;
    }
    return { all: customers.length, active, inactive, owing, credit };
  }, [customers]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = customers.filter((c) => {
      if (quick === "active" && !c.active) return false;
      if (quick === "inactive" && c.active) return false;
      if (quick === "owing" && !(c.balance > 0.009)) return false;
      if (quick === "credit" && !(c.creditLimit > 0.009)) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        (c.phone || "").toLowerCase().includes(term) ||
        (c.email || "").toLowerCase().includes(term)
      );
    });

    if (quick === "owing") {
      list = [...list].sort((a, b) => b.balance - a.balance);
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [customers, q, quick]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(safePage * pageSize, filtered.length);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function applyQuick(next: QuickFilter) {
    setQuick(next);
    if (next === "owing") setFocusStat("owing");
    else if (next === "active") setFocusStat("active");
    else if (next === "credit") setFocusStat("credit");
    else setFocusStat("total");
  }

  function resetFilters() {
    setQ("");
    applyQuick("all");
  }

  function openAdd() {
    setForm({
      name: "",
      phone: "",
      email: "",
      creditLimit: "0",
      storeCredit: "0",
      priceLevelId: "",
    });
    setEditOwes(false);
    setError("");
    setEditId(null);
    setShowAdd(true);
  }

  function openEdit(c: Customer) {
    const storeCredit = Math.max(0, -Number(c.balance) || 0);
    setForm({
      name: c.name,
      phone: c.phone || "",
      email: c.email || "",
      creditLimit: String(c.creditLimit || 0),
      storeCredit: String(storeCredit),
      priceLevelId: c.priceLevelId || c.priceLevel?.id || "",
    });
    setEditOwes(Number(c.balance) > 0.009);
    setError("");
    setEditId(c.id);
    setShowAdd(true);
  }

  async function confirmToggleActive() {
    if (!confirmStatus) return;
    const c = confirmStatus;
    const next = !c.active;
    setStatusBusy(true);
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, active: next }),
    });
    setStatusBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setConfirmStatus(null);
      setAlertMsg(data.error || "Failed to update status");
      return;
    }
    setConfirmStatus(null);
    load();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      creditLimit: Number(form.creditLimit) || 0,
      priceLevelId: form.priceLevelId || null,
    };
    // Prepaid top-up: only when not owing (or on create).
    if (!editId || !editOwes) {
      payload.storeCredit = Number(form.storeCredit) || 0;
    }
    const res = editId
      ? await fetch("/api/customers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editId, ...payload }),
        })
      : await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setShowAdd(false);
    setEditId(null);
    load();
  }

  const owedParts = formatMoneyParts(stats.owed);
  const creditParts = formatMoneyParts(stats.creditCap);

  return (
    <div className="space-y-6">
      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
        aria-label="Customers overview"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              Customers & Accounts
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">Credit ledger & contact book</span>
              <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                Live directory
              </span>
              {stats.owing > 0 ? (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  {stats.owing} owing
                </span>
              ) : null}
              {stats.inactive > 0 ? (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-inset ring-slate-500/20">
                  {stats.inactive} inactive
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Link href="/receipts" className={ghostBtn}>
              View receipts
            </Link>
            <button type="button" className={primaryBtn} onClick={openAdd}>
              + New customer
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 border-t border-slate-200 lg:grid-cols-4 lg:divide-y-0">
          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "total" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setFocusStat("total");
              applyQuick("all");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Customers
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {stats.total}
              </span>
              <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700">
                accounts
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {stats.active} active · {stats.inactive} inactive
            </p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              View all →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "active" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setFocusStat("active");
              applyQuick("active");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Active
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-emerald-700 sm:text-lg">
                {stats.active}
              </span>
              <span className="rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-medium text-emerald-800">
                ready for POS
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Selectable on the till</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Show active →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "owing" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setFocusStat("owing");
              applyQuick("owing");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Pending credit
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-amber-700 sm:text-lg">
                {owedParts.whole}
                <span className="text-sm text-amber-400">.{owedParts.frac}</span>
              </span>
              {stats.owing > 0 ? (
                <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                  {stats.owing} accts
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-[11px] text-slate-500">
              {stats.topDebtors.length ? stats.topDebtors.join(" & ") : "No open balances"}
            </p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Collect →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "credit" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setFocusStat("credit");
              applyQuick("credit");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Credit limits
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {creditParts.whole}
                <span className="text-sm text-slate-400">.{creditParts.frac}</span>
              </span>
              <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700">
                {stats.onCredit} caps
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Approved account credit</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Show credit →
            </span>
          </button>
        </div>
      </section>

      <div className="space-y-4 rounded-2xl border border-[var(--sf-border)] bg-white p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="relative sm:col-span-2 lg:col-span-7">
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="9" cy="9" r="6" />
              <path d="M14 14l4 4" />
            </svg>
            <input
              type="search"
              className="w-full rounded-xl border border-[var(--sf-border)] bg-[var(--sf-surface-2)] py-2.5 pl-10 pr-9 text-xs text-[var(--sf-brand)] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--sf-accent)]"
              placeholder="Search name, phone, or email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="lg:col-span-3">
            <select
              className="w-full appearance-none rounded-xl border border-[var(--sf-border)] bg-[var(--sf-surface-2)] px-3.5 py-2.5 text-xs font-medium text-[var(--sf-brand)]"
              value={quick}
              onChange={(e) => applyQuick(e.target.value as QuickFilter)}
            >
              <option value="all">All customers</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
              <option value="owing">Owing / balance due</option>
              <option value="credit">Credit accounts</option>
            </select>
          </div>
          <div className="flex justify-end lg:col-span-2">
            <button
              type="button"
              title="Reset all filters"
              className="inline-flex items-center gap-1 py-2 text-xs font-semibold text-[var(--sf-accent)] hover:text-[var(--sf-accent-deep)]"
              onClick={resetFilters}
            >
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Quick Filters:
          </span>
          {(
            [
              { id: "all" as const, label: `All (${counts.all})` },
              { id: "active" as const, label: `Active (${counts.active})` },
              { id: "inactive" as const, label: `Inactive (${counts.inactive})` },
              { id: "owing" as const, label: `Owing (${counts.owing})` },
              { id: "credit" as const, label: `Credit (${counts.credit})` },
            ] as const
          ).map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => applyQuick(pill.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                quick === pill.id
                  ? "border border-orange-200 bg-orange-50 text-orange-800"
                  : "border border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--sf-border)] bg-white shadow-sm">
        <div className="hidden grid-cols-12 items-center gap-3 border-b border-[var(--sf-border)] bg-slate-50/80 px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500 lg:grid">
          <div className="col-span-3">Customer & Contact</div>
          <div className="col-span-2">Phone</div>
          <div className="col-span-2">Outstanding</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1">Joined</div>
          <div className="col-span-3 text-right">Customer Actions</div>
        </div>

        {loading ? (
          <p className="px-6 py-16 text-center text-sm text-[var(--sf-muted)]">
            Loading customers…
          </p>
        ) : !paged.length ? (
          <div className="py-16 text-center">
            <h3 className="text-base font-bold text-[var(--sf-brand)]">
              No matching customers found
            </h3>
            <p className="mt-1 text-xs text-[var(--sf-muted)]">
              Try adjusting your search or status filters.
            </p>
            <button type="button" className="sf-btn sf-btn-accent mt-4" onClick={resetFilters}>
              Reset filters
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {paged.map((c) => {
              const unpaid = c.balance > 0.009;
              return (
                <li
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/customers/${c.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/customers/${c.id}`);
                    }
                  }}
                  className="grid cursor-pointer grid-cols-1 gap-3 px-4 py-4 transition hover:bg-slate-50/80 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-3"
                >
                  <div className="flex items-center gap-3 lg:col-span-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                      {initials(c.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--sf-brand)]">
                        {c.name}
                      </p>
                      <p className="truncate text-[11px] text-[var(--sf-muted)]">
                        {c.email || "No email"}
                        {c.priceLevel?.name ? ` · ${c.priceLevel.name}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <p className="font-mono text-xs font-medium text-[var(--sf-brand)]">
                      {c.phone || "—"}
                    </p>
                    {c.creditLimit > 0.009 ? (
                      <p className="mt-0.5 text-[11px] text-[var(--sf-muted)]">
                        Limit {formatKes(c.creditLimit)}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-[var(--sf-muted)]">No credit cap</p>
                    )}
                  </div>

                  <div className="lg:col-span-2">
                    <p className="font-mono text-sm font-bold text-[var(--sf-brand)]">
                      {formatKes(c.balance)}
                    </p>
                    <p className="text-[11px] text-[var(--sf-muted)]">
                      {unpaid ? (
                        <span className="font-semibold text-amber-600">
                          {c.openReceipts > 0
                            ? `${c.openReceipts} open receipt${c.openReceipts === 1 ? "" : "s"}`
                            : "Balance due"}
                        </span>
                      ) : (
                        "Settled"
                      )}
                    </p>
                  </div>

                  <div className="lg:col-span-1">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        !c.active
                          ? "bg-slate-100 text-slate-600"
                          : unpaid
                            ? "bg-amber-100 text-amber-900"
                            : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {!c.active ? "Inactive" : unpaid ? "Owing" : "Active"}
                    </span>
                  </div>

                  <div className="lg:col-span-1">
                    <p className="text-xs text-[var(--sf-muted)]">{formatCreated(c.createdAt)}</p>
                  </div>

                  <div
                    className="flex items-center justify-start lg:col-span-3 lg:justify-end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex overflow-hidden rounded-xl border border-[var(--sf-border)] bg-white shadow-sm">
                      <button
                        type="button"
                        title="Edit details"
                        className="inline-flex items-center gap-1.5 border-r border-[var(--sf-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--sf-accent-deep)] hover:bg-[var(--sf-accent-soft)]"
                        onClick={() => openEdit(c)}
                      >
                        <svg
                          className="size-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                          />
                        </svg>
                        Edit
                      </button>
                      <button
                        type="button"
                        title={c.active ? "Deactivate customer" : "Activate customer"}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold ${
                          c.active
                            ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                        onClick={() => setConfirmStatus(c)}
                      >
                        {c.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--sf-border)] px-4 py-3 text-sm text-[var(--sf-muted)] sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {filtered.length
                ? `Showing ${pageStart} – ${pageEnd} of ${filtered.length}`
                : "Showing 0 of 0"}
            </span>
            <label className="flex items-center gap-1.5 text-xs">
              Per page
              <select
                className="rounded-md border border-[var(--sf-border)] bg-white px-2 py-1"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="sf-btn sf-btn-sm sf-btn-ghost"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="sf-btn sf-btn-sm sf-btn-ghost"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showAdd &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6 backdrop-blur-[1px] sm:py-10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-modal-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setShowAdd(false);
                setEditId(null);
                setError("");
              }
            }}
          >
            <div className="my-auto w-full max-w-xl">
              <div className="mb-4 text-center">
                <h2
                  id="customer-modal-title"
                  className="text-xl font-semibold tracking-tight text-slate-800 sm:text-2xl"
                >
                  {editId ? "Edit customer" : "Create new customer"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editId
                    ? "Update this customer’s contact and credit details."
                    : "Add a customer for credit sales and account balances."}
                </p>
              </div>

              <form
                onSubmit={save}
                className="flex max-h-[min(40rem,calc(100vh-8rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
              >
                {error ? (
                  <p className="shrink-0 border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
                    {error}
                  </p>
                ) : null}

                <div className="min-h-0 flex-1 space-y-0 divide-y divide-slate-100 overflow-y-auto">
                  <div className="grid gap-2 px-5 py-5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center sm:gap-6">
                    <label htmlFor="customer-name" className="text-sm font-medium text-slate-700">
                      Name
                    </label>
                    <input
                      id="customer-name"
                      className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      placeholder="Rafiki Hardwares"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="grid gap-2 px-5 py-5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center sm:gap-6">
                    <label htmlFor="customer-email" className="text-sm font-medium text-slate-700">
                      Email
                    </label>
                    <input
                      id="customer-email"
                      type="email"
                      className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      placeholder="accounts@rafiki.co.ke"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2 px-5 py-5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-start sm:gap-6">
                    <label
                      htmlFor="customer-phone"
                      className="pt-2.5 text-sm font-medium text-slate-700"
                    >
                      Phone
                    </label>
                    <div>
                      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
                        <input
                          className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-500 outline-none"
                          value="+254"
                          readOnly
                          aria-label="Country code"
                        />
                        <input
                          id="customer-phone"
                          className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                          placeholder="712 345 678"
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-slate-400">
                        Kenya numbers preferred. M-Pesa STK uses this number when set.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 px-5 py-5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-start sm:gap-6">
                    <span className="pt-2.5 text-sm font-medium text-slate-700">
                      Store credit
                    </span>
                    <div>
                      <label htmlFor="customer-store-credit" className="sr-only">
                        Store credit
                      </label>
                      <input
                        id="customer-store-credit"
                        className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400"
                        placeholder="Prepaid balance (KSh)"
                        inputMode="decimal"
                        value={form.storeCredit}
                        onChange={(e) => setForm({ ...form, storeCredit: e.target.value })}
                        disabled={Boolean(editId && editOwes)}
                      />
                      <p className="mt-1.5 text-xs text-slate-400">
                        {editId && editOwes
                          ? "Clear their outstanding balance first (or overpay on their account). Then you can set prepaid credit here."
                          : "Prepaid top-up the customer can use on future sales. Separate from credit limit."}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 px-5 py-5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-start sm:gap-6">
                    <span className="pt-2.5 text-sm font-medium text-slate-700">
                      Credit limit
                    </span>
                    <div className="space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label htmlFor="customer-limit" className="sr-only">
                            Credit limit
                          </label>
                          <input
                            id="customer-limit"
                            className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                            placeholder="Max they may owe (KSh)"
                            inputMode="decimal"
                            value={form.creditLimit}
                            onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
                          />
                        </div>
                        <div>
                          <label htmlFor="customer-level" className="sr-only">
                            Price level
                          </label>
                          <select
                            id="customer-level"
                            className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                            value={form.priceLevelId}
                            onChange={(e) => setForm({ ...form, priceLevelId: e.target.value })}
                          >
                            <option value="">Default / Retail</option>
                            {levels.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name} (-{l.discountPercent}%)
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">
                        Credit limit is how much they may owe. Store credit is money already paid in.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-x-2 border-t border-slate-100 px-5 py-4">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setShowAdd(false);
                      setEditId(null);
                      setError("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center rounded-lg bg-[var(--sf-brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--sf-brand-soft)] disabled:opacity-50"
                    disabled={saving}
                  >
                    {saving ? "Saving…" : editId ? "Save changes" : "Add customer"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      <ConfirmDialog
        open={Boolean(confirmStatus)}
        title={
          confirmStatus?.active
            ? `Deactivate ${confirmStatus.name}?`
            : `Activate ${confirmStatus?.name || "customer"}?`
        }
        message={
          confirmStatus?.active
            ? "They will be hidden from new sales. Existing balances and history stay on file."
            : "They will appear again when selecting a customer on POS and credit sales."
        }
        confirmLabel={confirmStatus?.active ? "Deactivate" : "Activate"}
        tone={confirmStatus?.active ? "danger" : "success"}
        loading={statusBusy}
        onCancel={() => {
          if (!statusBusy) setConfirmStatus(null);
        }}
        onConfirm={confirmToggleActive}
      />

      <ConfirmDialog
        open={Boolean(alertMsg)}
        title="Couldn’t update customer"
        message={alertMsg || ""}
        confirmLabel="OK"
        hideCancel
        tone="danger"
        onCancel={() => setAlertMsg(null)}
        onConfirm={() => setAlertMsg(null)}
      />
    </div>
  );
}
