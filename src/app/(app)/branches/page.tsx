"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { hasPermission } from "@/lib/permissions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Branch = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  active: boolean;
  _count?: { users: number; sales: number; stocks: number };
};

type StatusFilter = "ALL" | "active" | "inactive";
type FocusStat = "active" | "inactive" | "staff" | "stock";

const emptyForm = {
  name: "",
  code: "",
  address: "",
  city: "",
  country: "Kenya",
  phone: "",
};

export default function BranchesPage() {
  const { data: session } = useSession();
  const canEdit = hasPermission(session?.user, "branches.manage");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showAddress, setShowAddress] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [focusStat, setFocusStat] = useState<FocusStat>("active");
  const [confirmAction, setConfirmAction] = useState<
    null | { type: "deactivate" | "delete"; branch: Branch }
  >(null);
  const [notice, setNotice] = useState<null | { title: string; message: string }>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const ghostBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50";
  const primaryBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50";
  const filterCtrl =
    "h-8 min-w-[7.5rem] appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900";
  const fieldInput =
    "mt-1.5 h-10 w-full rounded-[10px] border-0 bg-[#f8fafc] px-3 text-xs text-slate-900 ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-slate-900";

  async function load() {
    setLoading(true);
    const list = await fetch("/api/branches").then((r) => r.json());
    setBranches(Array.isArray(list) ? list : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const active = branches.filter((b) => b.active).length;
    const inactive = branches.filter((b) => !b.active).length;
    const staff = branches.reduce((s, b) => s + (b._count?.users || 0), 0);
    const stock = branches.reduce((s, b) => s + (b._count?.stocks || 0), 0);
    return { active, inactive, staff, stock };
  }, [branches]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return branches.filter((b) => {
      if (statusFilter === "active" && !b.active) return false;
      if (statusFilter === "inactive" && b.active) return false;
      if (!term) return true;
      const loc = [b.city, b.country, b.address].filter(Boolean).join(" ").toLowerCase();
      return (
        b.code.toLowerCase().includes(term) ||
        b.name.toLowerCase().includes(term) ||
        loc.includes(term) ||
        (b.phone || "").toLowerCase().includes(term)
      );
    });
  }, [branches, q, statusFilter]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowAddress(false);
    setError("");
    setShowForm(true);
  }

  function openEdit(b: Branch) {
    setEditing(b);
    setForm({
      name: b.name,
      code: b.code,
      address: b.address || "",
      city: b.city || "",
      country: b.country || "",
      phone: b.phone || "",
    });
    setShowAddress(Boolean(b.address || b.city || b.phone));
    setError("");
    setShowForm(true);
  }

  async function save() {
    setError("");
    if (!form.name.trim() || !form.code.trim()) {
      setError("Name and code are required");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      address: form.address || null,
      city: form.city || null,
      country: form.country || null,
      phone: form.phone || null,
    };
    const res = await fetch(editing ? `/api/branches/${editing.id}` : "/api/branches", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    setShowForm(false);
    load();
  }

  async function activate(b: Branch) {
    await fetch(`/api/branches/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    load();
  }

  function askDeactivate(b: Branch) {
    setConfirmAction({ type: "deactivate", branch: b });
  }

  function askRemove(b: Branch) {
    if (b.code === "BR0001") {
      setNotice({
        title: "Cannot delete Main branch",
        message: "The Main branch is required and cannot be permanently deleted.",
      });
      return;
    }
    setConfirmAction({ type: "delete", branch: b });
  }

  async function runConfirmAction() {
    if (!confirmAction) return;
    const { type, branch } = confirmAction;
    setActionBusy(true);
    try {
      if (type === "deactivate") {
        const res = await fetch(`/api/branches/${branch.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "deactivate" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setConfirmAction(null);
          setNotice({
            title: "Could not deactivate branch",
            message: data.error || "Something went wrong. Try again.",
          });
          return;
        }
        setConfirmAction(null);
        load();
        return;
      }
      const res = await fetch(`/api/branches/${branch.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConfirmAction(null);
        setNotice({
          title: "Could not delete branch",
          message: data.error || "Staff, sales, sessions, or stock may be blocking deletion.",
        });
        return;
      }
      setConfirmAction(null);
      load();
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="space-y-4 [font-variant-numeric:tabular-nums]">
      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
        aria-label="Branches overview"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              Branches
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">
                Locations with their own till and stock
              </span>
              {stats.inactive > 0 ? (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  {stats.inactive} inactive
                </span>
              ) : null}
            </div>
          </div>
          {canEdit ? (
            <button type="button" className={primaryBtn} onClick={openCreate}>
              + Add branch
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 border-t border-slate-200 lg:grid-cols-4 lg:divide-y-0">
          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "active" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setFocusStat("active");
              setStatusFilter("active");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Active
            </p>
            <span className="mt-0.5 font-mono text-base font-bold tracking-tight text-emerald-700 sm:text-lg">
              {stats.active}
            </span>
            <p className="mt-1 text-[11px] text-slate-500">Open for POS & stock</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              View active →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "inactive" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setFocusStat("inactive");
              setStatusFilter("inactive");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Inactive
            </p>
            <span className="mt-0.5 font-mono text-base font-bold tracking-tight text-amber-700 sm:text-lg">
              {stats.inactive}
            </span>
            <p className="mt-1 text-[11px] text-slate-500">Hidden from POS switcher</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Review inactive →
            </span>
          </button>

          <Link
            href="/users"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "staff" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => setFocusStat("staff")}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Staff assigned
            </p>
            <span className="mt-0.5 font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
              {stats.staff}
            </span>
            <p className="mt-1 text-[11px] text-slate-500">Users with a home branch</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Open users →
            </span>
          </Link>

          <Link
            href="/inventory"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              focusStat === "stock" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => setFocusStat("stock")}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Stock SKUs
            </p>
            <span className="mt-0.5 font-mono text-base font-bold tracking-tight text-indigo-700 sm:text-lg">
              {stats.stock}
            </span>
            <p className="mt-1 text-[11px] text-slate-500">Across all branch stock rows</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Open inventory →
            </span>
          </Link>
        </div>
      </section>

      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
        aria-label="Branch directory"
      >
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
          <label className="relative min-w-[160px] flex-1 sm:max-w-xs">
            <span className="sr-only">Search branches</span>
            <input
              type="search"
              placeholder="Search code, name, city…"
              className="h-8 w-full rounded-lg border-0 bg-white px-2.5 text-[11px] ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <select
            className={filterCtrl}
            value={statusFilter}
            onChange={(e) => {
              const next = e.target.value as StatusFilter;
              setStatusFilter(next);
              setFocusStat(next === "inactive" ? "inactive" : "active");
            }}
            aria-label="Status"
          >
            <option value="ALL">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <span className="ms-auto text-[11px] text-slate-500">
            {filtered.length} branch{filtered.length === 1 ? "" : "es"}
          </span>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Loading branches…</p>
        ) : !filtered.length ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No branches match your filters
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50/80 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5 sm:px-4">Code</th>
                  <th className="px-3 py-2.5 sm:px-4">Name</th>
                  <th className="px-3 py-2.5 sm:px-4">Location</th>
                  <th className="px-3 py-2.5 sm:px-4">Staff</th>
                  <th className="px-3 py-2.5 sm:px-4">Stock</th>
                  <th className="px-3 py-2.5 sm:px-4">Status</th>
                  <th className="px-3 py-2.5 text-right sm:px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                  >
                    <td className="px-3 py-3 font-mono text-[11px] font-semibold text-slate-500 sm:px-4">
                      {b.code}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-slate-900 sm:px-4">
                      {b.name}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500 sm:px-4">
                      {[b.city, b.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs font-medium tabular-nums text-slate-900 sm:px-4">
                      {b._count?.users ?? 0}
                    </td>
                    <td className="px-3 py-3 text-xs font-medium tabular-nums text-slate-900 sm:px-4">
                      {b._count?.stocks ?? 0}
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          b.active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {b.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      {canEdit ? (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button type="button" className={ghostBtn} onClick={() => openEdit(b)}>
                            Edit
                          </button>
                          {b.active ? (
                            <button
                              type="button"
                              className={ghostBtn}
                              onClick={() => askDeactivate(b)}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={ghostBtn}
                              onClick={() => activate(b)}
                            >
                              Activate
                            </button>
                          )}
                          {b.code !== "BR0001" ? (
                            <button
                              type="button"
                              className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50"
                              onClick={() => askRemove(b)}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5 text-xs text-slate-500 sm:px-4">
          <span>
            {filtered.length
              ? `Showing 1 – ${filtered.length} of ${filtered.length}`
              : "Showing 0 of 0"}
          </span>
          <div className="flex gap-1.5">
            <button type="button" className={ghostBtn} disabled>
              Previous
            </button>
            <button type="button" className={ghostBtn} disabled>
              Next
            </button>
          </div>
        </div>
      </section>

      {showForm ? (
        <div className="sf-modal-backdrop">
          <div className="sf-modal max-w-md space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {editing ? "Edit branch" : "Add branch"}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {editing
                  ? "Update branch details."
                  : "Create a location with a unique code for till and stock."}
              </p>
            </div>
            {error ? <p className="sf-alert sf-alert-error">{error}</p> : null}
            <div className="space-y-3">
              <label className="block text-[11px] font-medium text-slate-500">
                Name
                <input
                  className={fieldInput}
                  placeholder="Branch name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </label>
              <label className="block text-[11px] font-medium text-slate-500">
                Code
                <input
                  className={fieldInput}
                  placeholder="e.g. BR0002"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={editing?.code === "BR0001"}
                />
              </label>
              <button
                type="button"
                className="text-xs font-medium text-indigo-700 hover:underline"
                onClick={() => setShowAddress((v) => !v)}
              >
                Address & contact {showAddress ? "−" : "+"}
              </button>
              {showAddress ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-[11px] font-medium text-slate-500 sm:col-span-2">
                    Address
                    <input
                      className={fieldInput}
                      placeholder="Street, building, unit"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                    />
                  </label>
                  <label className="block text-[11px] font-medium text-slate-500">
                    City
                    <input
                      className={fieldInput}
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </label>
                  <label className="block text-[11px] font-medium text-slate-500">
                    Country
                    <input
                      className={fieldInput}
                      value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                    />
                  </label>
                  <label className="block text-[11px] font-medium text-slate-500 sm:col-span-2">
                    Phone
                    <input
                      className={fieldInput}
                      placeholder="+254…"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </label>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={ghostBtn} onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="button" className={primaryBtn} disabled={saving} onClick={save}>
                {saving ? "Saving…" : editing ? "Save changes" : "Add branch"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={
          confirmAction?.type === "delete"
            ? `Delete ${confirmAction.branch.name}?`
            : `Deactivate ${confirmAction?.branch.name || "branch"}?`
        }
        message={
          confirmAction?.type === "delete"
            ? "This permanently removes the branch. Staff, sales, sessions, or stock with quantity will block deletion."
            : "The branch will be hidden from day-to-day use. You can activate it again later."
        }
        confirmLabel={confirmAction?.type === "delete" ? "Delete" : "Deactivate"}
        tone="danger"
        loading={actionBusy}
        onCancel={() => {
          if (!actionBusy) setConfirmAction(null);
        }}
        onConfirm={runConfirmAction}
      />

      <ConfirmDialog
        open={Boolean(notice)}
        title={notice?.title || ""}
        message={notice?.message || ""}
        confirmLabel="OK"
        hideCancel
        tone="danger"
        onCancel={() => setNotice(null)}
        onConfirm={() => setNotice(null)}
      />
    </div>
  );
}
