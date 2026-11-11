"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Promo = {
  id: string;
  name: string;
  percentOff: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  product: { id: string; name: string } | null;
};

type Product = { id: string; name: string };

type Status = "active" | "scheduled" | "ended";
type Filter = "active" | "all";

const emptyForm = {
  name: "",
  percentOff: "10",
  productId: "",
  startsAt: "",
  endsAt: "",
};

const panel =
  "overflow-hidden rounded-xl border border-[var(--sf-border)] bg-white shadow-sm";
const ghostBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sf-border)] bg-white px-2.5 text-xs font-medium text-[var(--sf-brand)] shadow-sm hover:bg-[var(--sf-surface-2)] disabled:opacity-50";
const primaryBtn =
  "inline-flex h-8 items-center rounded-lg bg-[var(--sf-accent)] px-3 text-xs font-semibold text-white shadow-sm hover:bg-[var(--sf-accent-deep)] disabled:opacity-50";
const fieldInput =
  "h-9 w-full rounded-md border border-[var(--sf-border)] bg-white px-2.5 text-sm text-[var(--sf-brand)] outline-none focus:border-[var(--sf-accent)] focus:ring-1 focus:ring-[var(--sf-accent)]";
const fieldLabel = "mb-1 block text-xs font-medium text-[var(--sf-muted)]";

function promoStatus(p: Promo, now = Date.now()): Status {
  if (!p.active) return "ended";
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return "scheduled";
  if (p.endsAt && new Date(p.endsAt).getTime() < now) return "ended";
  return "active";
}

function canReactivate(p: Promo, now = Date.now()) {
  if (p.active) return false;
  if (p.endsAt && new Date(p.endsAt).getTime() < now) return false;
  return true;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toDateInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateToIsoStart(date: string) {
  if (!date) return null;
  return new Date(`${date}T00:00:00`).toISOString();
}

function dateToIsoEnd(date: string) {
  if (!date) return null;
  return new Date(`${date}T23:59:59.999`).toISOString();
}

const statusBadge: Record<Status, string> = {
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  scheduled: "bg-amber-50 text-amber-900 ring-amber-200",
  ended: "bg-slate-100 text-slate-600 ring-slate-200",
};

const statusLabel: Record<Status, string> = {
  active: "Active",
  scheduled: "Scheduled",
  ended: "Ended",
};

export default function PromotionsPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");

  async function load() {
    setLoading(true);
    const [p, pr] = await Promise.all([
      fetch("/api/promotions?all=1").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
    ]);
    setPromos(Array.isArray(p) ? p : []);
    setProducts(Array.isArray(pr) ? pr : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const now = Date.now();

  const summary = useMemo(() => {
    let active = 0;
    let storewide = 0;
    let item = 0;
    for (const p of promos) {
      const s = promoStatus(p, now);
      if (s === "active") {
        active += 1;
        if (p.product) item += 1;
        else storewide += 1;
      }
    }
    return { active, storewide, item, total: promos.length };
  }, [promos, now]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return promos.filter((p) => {
      const status = promoStatus(p, now);
      if (filter === "active" && status !== "active" && status !== "scheduled") return false;
      if (!needle) return true;
      const hay = `${p.name} ${p.product?.name || "all"} ${status}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [promos, q, filter, now]);

  function resetForm() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
  }

  function startEdit(p: Promo) {
    setEditId(p.id);
    setForm({
      name: p.name,
      percentOff: String(p.percentOff),
      productId: p.product?.id || "",
      startsAt: toDateInput(p.startsAt),
      endsAt: toDateInput(p.endsAt),
    });
    setError("");
    if (typeof window !== "undefined") {
      document.getElementById("promo-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const payload = {
      name: form.name,
      percentOff: Number(form.percentOff),
      productId: form.productId || null,
      startsAt: dateToIsoStart(form.startsAt),
      endsAt: dateToIsoEnd(form.endsAt),
    };
    const res = await fetch("/api/promotions", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editId ? { id: editId, ...payload } : payload),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || (editId ? "Failed to update promotion" : "Failed to create promotion"));
      return;
    }
    resetForm();
    load();
  }

  async function setActive(id: string, active: boolean) {
    setBusyId(id);
    await fetch("/api/promotions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    setBusyId(null);
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch("/api/promotions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteTarget.id }),
    });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete promotion");
      setDeleteTarget(null);
      return;
    }
    if (editId === deleteTarget.id) resetForm();
    setDeleteTarget(null);
    load();
  }

  return (
    <div className="space-y-4">
      <section className={panel} aria-label="Promotions overview">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <h1 className="sf-display truncate text-lg font-extrabold tracking-tight text-[var(--sf-brand)] sm:text-xl">
              Promotions
            </h1>
            <p className="mt-0.5 text-xs text-[var(--sf-muted)]">
              Percent-off deals at checkout — storewide or per product
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-8 w-44 rounded-md border border-[var(--sf-border)] bg-white px-2.5 text-xs text-[var(--sf-brand)] outline-none focus:border-[var(--sf-accent)] focus:ring-1 focus:ring-[var(--sf-accent)] sm:w-56"
              placeholder="Search promotions…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="inline-flex h-8 overflow-hidden rounded-lg border border-[var(--sf-border)] bg-white text-xs font-semibold">
              {([
                ["active", "Active"],
                ["all", "All"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`px-3 transition ${
                    filter === key
                      ? "bg-[var(--sf-accent)] text-white"
                      : "text-[var(--sf-brand)] hover:bg-[var(--sf-surface-2)]"
                  }`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-slate-100 sm:grid-cols-4">
          {[
            { label: "Live now", value: String(summary.active), note: "In checkout window" },
            { label: "Storewide", value: String(summary.storewide), note: "All products" },
            { label: "Item deals", value: String(summary.item), note: "Single product" },
            { label: "Total listed", value: String(summary.total), note: "Active + ended" },
          ].map((m) => (
            <div
              key={m.label}
              className="relative min-w-0 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[var(--sf-brand)]/80 to-transparent" />
              <p className="pl-2 text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                {m.label}
              </p>
              <p className="mt-1 truncate pl-2 font-mono text-base font-extrabold tabular-nums text-[var(--sf-brand)]">
                {m.value}
              </p>
              <p className="mt-0.5 truncate pl-2 text-[10px] text-[var(--sf-muted)]">{m.note}</p>
            </div>
          ))}
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800">
          {error}
        </p>
      ) : null}

      <section id="promo-form" className={panel} aria-label={editId ? "Edit promotion" : "Create promotion"}>
        <header className="border-b border-slate-100 px-5 py-3">
          <h2 className="sf-display text-[13px] font-bold text-[var(--sf-brand)]">
            {editId ? "Edit promotion" : "Create promotion"}
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--sf-muted)]">
            Optional start/end dates. Leave blank for open-ended.
          </p>
        </header>
        <form onSubmit={save} className="grid gap-x-3 gap-y-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className={fieldLabel} htmlFor="promoName">
              Name
            </label>
            <input
              id="promoName"
              className={fieldInput}
              placeholder="Weekend sale"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={fieldLabel} htmlFor="promoOff">
              % off
            </label>
            <input
              id="promoOff"
              className={`${fieldInput} font-mono`}
              inputMode="decimal"
              value={form.percentOff}
              onChange={(e) => setForm({ ...form, percentOff: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={fieldLabel} htmlFor="promoScope">
              Scope
            </label>
            <select
              id="promoScope"
              className={fieldInput}
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              <option value="">All products (storewide)</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabel} htmlFor="promoStarts">
              Starts
            </label>
            <input
              id="promoStarts"
              type="date"
              className={`${fieldInput} font-mono`}
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </div>
          <div>
            <label className={fieldLabel} htmlFor="promoEnds">
              Ends
            </label>
            <input
              id="promoEnds"
              type="date"
              className={`${fieldInput} font-mono`}
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-2">
            <button type="submit" className={primaryBtn} disabled={saving}>
              {saving ? "Saving…" : editId ? "Save changes" : "Create promotion"}
            </button>
            {editId ? (
              <button type="button" className={ghostBtn} onClick={resetForm} disabled={saving}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className={panel} aria-label="Promotion list">
        <header className="border-b border-slate-100 px-5 py-3">
          <h2 className="sf-display text-[13px] font-bold text-[var(--sf-brand)]">
            Promotion list
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--sf-muted)]">
            {filter === "active"
              ? "Showing active and scheduled promotions"
              : "Showing all promotions including ended"}
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-[var(--sf-surface-2)]/80 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                <th className="px-5 py-3">Promotion</th>
                <th className="px-5 py-3 text-end">Off</th>
                <th className="px-5 py-3">Scope</th>
                <th className="px-5 py-3">Schedule</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-[var(--sf-muted)]">
                    Loading promotions…
                  </td>
                </tr>
              ) : (
                visible.map((p, i) => {
                  const status = promoStatus(p, now);
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-slate-50 text-[var(--sf-brand)] ${
                        editId === p.id
                          ? "bg-[var(--sf-accent-soft)]/50"
                          : i % 2 === 1
                            ? "bg-[var(--sf-surface-2)]/35"
                            : "bg-white"
                      }`}
                    >
                      <td className="px-5 py-3 text-xs font-semibold">{p.name}</td>
                      <td className="px-5 py-3 text-end font-mono text-xs font-bold tabular-nums">
                        {p.percentOff}%
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--sf-muted)]">
                        {p.product?.name || "All products"}
                      </td>
                      <td className="px-5 py-3 font-mono text-[11px] tabular-nums text-[var(--sf-muted)]">
                        {formatDate(p.startsAt)} → {formatDate(p.endsAt)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${statusBadge[status]}`}
                        >
                          {statusLabel[status]}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            title="Edit"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            disabled={busyId === p.id}
                            onClick={() => startEdit(p)}
                          >
                            <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                          {p.active ? (
                            <button
                              type="button"
                              title="End promotion"
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                              disabled={busyId === p.id}
                              onClick={() => setActive(p.id, false)}
                            >
                              <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                              {busyId === p.id ? "…" : "End"}
                            </button>
                          ) : canReactivate(p, now) ? (
                            <button
                              type="button"
                              title="Reactivate"
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-[var(--sf-brand)] px-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                              disabled={busyId === p.id}
                              onClick={() => setActive(p.id, true)}
                            >
                              <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              {busyId === p.id ? "…" : "Reactivate"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            title="Delete"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            disabled={busyId === p.id}
                            onClick={() => setDeleteTarget(p)}
                          >
                            <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
              {!loading && !visible.length && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-[var(--sf-muted)]">
                    No promotions match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete promotion?"
        message={
          deleteTarget
            ? `“${deleteTarget.name}” will be removed permanently. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
