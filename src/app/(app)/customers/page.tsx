"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatKes } from "@/lib/money";
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
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "OWING";
type SortKey = "name" | "balance" | "createdAt" | "status";

const PAGE_SIZE = 10;

const AVATAR_TONES = [
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-800",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-cyan-100 text-cyan-800",
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

function formatCreated(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function IconSearch({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

function IconFilter({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 5h16l-6 7v5l-4 2v-7L4 5z" />
    </svg>
  );
}

function IconUserPlus({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}

function IconCheck({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconClock({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconSort({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 7l4-4 4 4H8zm0 10l4 4 4-4H8z" />
    </svg>
  );
}

function IconMore({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function IconShield({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [levels, setLevels] = useState<PriceLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [showFilter, setShowFilter] = useState(false);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    priceLevelId: "",
  });

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("inactive", "1");
    params.set("sort", "name");
    const [c, l] = await Promise.all([
      fetch(`/api/customers?${params}`).then((r) => r.json()),
      fetch("/api/price-levels").then((r) => r.json()).catch(() => []),
    ]);
    setCustomers(Array.isArray(c) ? c : []);
    setLevels(Array.isArray(l) ? l : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!menuId) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuId(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

  const activeFilterCount = statusFilter === "ALL" ? 0 : 1;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = customers.filter((c) => {
      if (statusFilter === "ACTIVE" && !c.active) return false;
      if (statusFilter === "INACTIVE" && c.active) return false;
      if (statusFilter === "OWING" && !(c.balance > 0.009)) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        (c.phone || "").toLowerCase().includes(term) ||
        (c.email || "").toLowerCase().includes(term)
      );
    });

    list = [...list].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "name") {
        av = a.name.toLowerCase();
        bv = b.name.toLowerCase();
      } else if (sortKey === "balance") {
        av = a.balance;
        bv = b.balance;
      } else if (sortKey === "createdAt") {
        av = a.createdAt || "";
        bv = b.createdAt || "";
      } else {
        av = a.active ? 1 : 0;
        bv = b.active ? 1 : 0;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [customers, q, statusFilter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE);

  const pageButtons = useMemo(() => {
    const max = Math.min(pageCount, 5);
    const start = Math.min(Math.max(0, safePage - 2), Math.max(0, pageCount - max));
    return Array.from({ length: max }, (_, i) => start + i);
  }, [pageCount, safePage]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  function openAdd() {
    setForm({ name: "", phone: "", email: "", creditLimit: "0", priceLevelId: "" });
    setError("");
    setEditId(null);
    setShowAdd(true);
    setMenuId(null);
  }

  function openEdit(c: Customer) {
    setForm({
      name: c.name,
      phone: c.phone || "",
      email: c.email || "",
      creditLimit: String(c.creditLimit || 0),
      priceLevelId: c.priceLevelId || c.priceLevel?.id || "",
    });
    setError("");
    setEditId(c.id);
    setShowAdd(true);
    setMenuId(null);
  }

  function askToggleActive(c: Customer) {
    setMenuId(null);
    setConfirmStatus(c);
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
    const payload = {
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      creditLimit: Number(form.creditLimit) || 0,
      priceLevelId: form.priceLevelId || null,
    };
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

  function SortHead({
    label,
    column,
    className = "",
  }: {
    label: string;
    column?: SortKey;
    className?: string;
  }) {
    const active = column && sortKey === column;
    return (
      <th className={`px-4 py-2.5 text-start align-middle ${className}`}>
        {column ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
            onClick={() => toggleSort(column)}
          >
            {label}
            <IconSort className={`h-3 w-3 ${active ? "text-slate-700" : "text-slate-300"}`} />
          </button>
        ) : (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </span>
        )}
      </th>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="relative min-w-[16rem] flex-1 sm:max-w-sm">
            <span className="pointer-events-none absolute inset-y-0 start-0 z-10 flex items-center ps-3.5 text-slate-400">
              <IconSearch className="h-4 w-4" />
            </span>
            <input
              type="search"
              className="block w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pe-3 ps-10 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
              placeholder="Search customers"
              aria-label="Search customers"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                className="inline-flex items-center gap-x-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setShowFilter((v) => !v)}
              >
                <IconFilter className="h-4 w-4 text-slate-500" />
                Filter
                {activeFilterCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {showFilter && (
                <div className="absolute end-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  {(
                    [
                      ["ALL", "All customers"],
                      ["ACTIVE", "Active"],
                      ["INACTIVE", "Inactive"],
                      ["OWING", "Owing only"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                        statusFilter === value ? "font-semibold text-slate-900" : "text-slate-600"
                      }`}
                      onClick={() => {
                        setStatusFilter(value);
                        setShowFilter(false);
                        setPage(0);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-x-2 rounded-lg bg-[var(--sf-brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--sf-brand-soft)]"
              onClick={openAdd}
            >
              <IconUserPlus className="h-4 w-4" />
              New customer
            </button>
          </div>
        </div>

        {loading ? (
          <p className="px-5 py-16 text-center text-sm text-slate-500">Loading customers…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] table-fixed text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100">
                  <SortHead label="Customer" column="name" />
                  <SortHead label="Phone" />
                  <SortHead label="Outstanding" column="balance" />
                  <SortHead label="Date" column="createdAt" />
                  <SortHead label="Status" column="status" />
                  <th className="px-4 py-2.5 text-end align-middle">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((c) => (
                  <tr key={c.id} className="odd:bg-white even:bg-slate-50/80 hover:bg-slate-100/80">
                    <td className="px-4 py-4 align-middle">
                      <div className="flex min-w-0 items-center gap-x-3">
                        <span
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarTone(c.id)}`}
                        >
                          {initials(c.name)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/customers/${c.id}`}
                            className="block truncate text-sm font-semibold text-slate-900 hover:text-[var(--sf-brand)]"
                          >
                            {c.name}
                          </Link>
                          <p className="truncate text-sm text-slate-500">
                            {c.email || "No email on record"}
                          </p>
                          {(c.balance > 0.009 || c.creditLimit > 0) && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500">
                              <IconShield className="text-sky-600" />
                              Credit customer
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="truncate px-4 py-4 align-middle text-slate-600">
                      {c.phone || "—"}
                    </td>
                    <td className="px-4 py-4 align-middle">
                      {c.balance > 0.009 ? (
                        <span className="inline-flex flex-col gap-0.5">
                          <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold tabular-nums text-amber-900">
                            {formatKes(c.balance)}
                          </span>
                          <span className="text-sm text-amber-700/80">
                            {c.openReceipts > 0
                              ? `${c.openReceipts} open receipt${c.openReceipts === 1 ? "" : "s"}`
                              : "Balance outstanding"}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex flex-col gap-0.5">
                          <span className="block text-sm font-semibold tabular-nums text-slate-900">
                            {formatKes(0)}
                          </span>
                          <span className="block text-sm text-slate-500">No open receipts</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 align-middle text-slate-500">
                      {formatCreated(c.createdAt)}
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.active ? (
                          <span className="inline-flex items-center gap-x-1.5 rounded-full bg-teal-100 px-2.5 py-1 text-xs font-medium text-teal-800">
                            <IconCheck />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-x-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                            <IconClock />
                            Inactive
                          </span>
                        )}
                        {c.balance > 0.009 && (
                          <span className="inline-flex items-center gap-x-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                            Owing
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-middle text-end">
                      <div
                        className="relative inline-flex justify-end"
                        ref={menuId === c.id ? menuRef : undefined}
                      >
                        <button
                          type="button"
                          className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`More actions for ${c.name}`}
                          aria-expanded={menuId === c.id}
                          aria-haspopup="menu"
                          onClick={() => setMenuId((id) => (id === c.id ? null : c.id))}
                        >
                          <IconMore />
                        </button>
                        {menuId === c.id && (
                          <div
                            role="menu"
                            className="absolute end-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-start shadow-lg ring-1 ring-black/5"
                          >
                            <Link
                              role="menuitem"
                              href={`/customers/${c.id}`}
                              className="block px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                              onClick={() => setMenuId(null)}
                            >
                              Open account
                            </Link>
                            <button
                              type="button"
                              role="menuitem"
                              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              onClick={() => openEdit(c)}
                            >
                              Edit details
                            </button>
                            <div className="my-1 border-t border-slate-100" />
                            <button
                              type="button"
                              role="menuitem"
                              className={`block w-full px-3 py-2 text-left text-sm font-medium hover:bg-slate-50 ${
                                c.active ? "text-rose-600" : "text-emerald-700"
                              }`}
                              onClick={() => askToggleActive(c)}
                            >
                              {c.active ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!pageRows.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-500">
                      No customers match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 sm:px-5">
          <span>
            Showing {from} to {to} of {filtered.length} customers
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              ‹
            </button>
            {pageButtons.map((n) => (
              <button
                key={n}
                type="button"
                className={`inline-flex size-8 items-center justify-center rounded-lg border text-xs font-medium ${
                  n === safePage
                    ? "border-[var(--sf-brand)] bg-[var(--sf-brand)] text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
                onClick={() => setPage(n)}
              >
                {n + 1}
              </button>
            ))}
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              aria-label="Next page"
            >
              ›
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
                    : "Add a customer for credit sales and the receivables ledger."}
                </p>
              </div>

              <form
                onSubmit={save}
                className="flex max-h-[min(40rem,calc(100vh-8rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
              >
                {error && (
                  <p className="shrink-0 border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
                    {error}
                  </p>
                )}

                <div className="min-h-0 flex-1 space-y-0 divide-y divide-slate-100 overflow-y-auto">
                  <div className="grid gap-3 px-5 py-5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center sm:gap-6">
                    <span className="text-sm font-medium text-slate-700">Avatar</span>
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-slate-200 text-sm font-bold ${
                          form.name.trim()
                            ? avatarTone(editId || form.name)
                            : "bg-slate-50 text-slate-400"
                        }`}
                      >
                        {form.name.trim() ? (
                          initials(form.name)
                        ) : (
                          <svg
                            className="h-6 w-6"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                          </svg>
                        )}
                      </span>
                      <p className="text-xs text-slate-500">
                        Initials are shown from the customer name. Photos are not stored.
                      </p>
                    </div>
                  </div>

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
                    <span className="pt-2.5 text-sm font-medium text-slate-700">Credit</span>
                    <div className="space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label htmlFor="customer-limit" className="sr-only">
                            Credit limit
                          </label>
                          <input
                            id="customer-limit"
                            className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                            placeholder="Credit limit (KSh)"
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
                        Limit of 0 means no credit cap. Price level adjusts POS sell prices.
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
