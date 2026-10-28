"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { canManageBranches } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";

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
  const canEdit =
    session?.user?.role && canManageBranches(session.user.role as Role);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showAddress, setShowAddress] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHow, setShowHow] = useState(true);

  async function load() {
    setLoading(true);
    const list = await fetch("/api/branches").then((r) => r.json());
    setBranches(Array.isArray(list) ? list : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

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
    const res = await fetch(
      editing ? `/api/branches/${editing.id}` : "/api/branches",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    setSaving(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    setShowForm(false);
    load();
  }

  async function deactivate(b: Branch) {
    if (!confirm(`Deactivate ${b.name}?`)) return;
    const res = await fetch(`/api/branches/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deactivate" }),
    });
    const data = await res.json();
    if (!res.ok) alert(data.error || "Failed");
    else load();
  }

  async function activate(b: Branch) {
    await fetch(`/api/branches/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    load();
  }

  async function remove(b: Branch) {
    if (!confirm(`Permanently delete ${b.name}? Only empty inactive branches can be deleted.`)) {
      return;
    }
    const res = await fetch(`/api/branches/${b.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) alert(data.error || "Failed");
    else load();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Branches"
        description="Locations that hold their own till and stock"
        actions={
          canEdit ? (
            <button type="button" className="sf-btn sf-btn-primary" onClick={openCreate}>
              + Add branch
            </button>
          ) : undefined
        }
      />

      <div className="sf-card border-teal-200/70 bg-gradient-to-br from-teal-50/80 to-white p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setShowHow((v) => !v)}
        >
          <div>
            <h2 className="font-semibold text-[var(--sf-brand)]">How branch stock works</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Each branch has its own inventory quantities and cash till.
            </p>
          </div>
          <span className="text-slate-400">{showHow ? "-" : "+"}</span>
        </button>
        {showHow && (
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Create a branch (code like BR0002) and assign staff on Users.</li>
            <li>Open the till for that branch from Cash — POS and Inventory use that branch stock.</li>
            <li>Receive purchases while on a branch to increase stock there.</li>
            <li>Managers can switch branch (when no till is open) from the top bar.</li>
          </ol>
        )}
      </div>

      <div className="sf-card overflow-hidden p-0">
        <div className="border-b border-slate-100 px-4 py-4">
          <h3 className="font-semibold text-[var(--sf-brand)]">All branches</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Create, edit, and deactivate branches. Inactive branches with no sales, stock, or staff
            can be permanently deleted.
          </p>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Loading branches...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sf-thead">
                <tr>
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Location</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id} className="sf-row">
                    <td className="px-3 py-2.5 font-mono text-xs">{b.code}</td>
                    <td className="px-3 py-2.5 font-medium">{b.name}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {[b.city, b.country].filter(Boolean).join(", ") || "-"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`sf-badge ${
                          b.active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {b.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canEdit && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            className="sf-link text-xs"
                            onClick={() => openEdit(b)}
                          >
                            Edit
                          </button>
                          {b.active ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-amber-700 hover:underline"
                              onClick={() => deactivate(b)}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="text-xs font-medium text-teal-700 hover:underline"
                                onClick={() => activate(b)}
                              >
                                Activate
                              </button>
                              <button
                                type="button"
                                className="text-xs font-medium text-rose-600 hover:underline"
                                onClick={() => remove(b)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="sf-modal-backdrop">
          <div className="sf-modal max-w-md">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">
                  {editing ? "Edit branch" : "Add branch"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editing
                    ? "Update branch details."
                    : "Create a new branch with a unique code."}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                onClick={() => setShowForm(false)}
              >
                x
              </button>
            </div>
            {error && <p className="sf-alert sf-alert-error mt-3">{error}</p>}
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Name
                <input
                  className="sf-input mt-1"
                  placeholder="Branch name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </label>
              <label className="block text-sm font-medium">
                Code
                <input
                  className="sf-input mt-1"
                  placeholder="Code used in reports (e.g. BR0002)"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={editing?.code === "BR0001"}
                />
              </label>
              <button
                type="button"
                className="text-sm font-medium text-[var(--sf-accent-deep)]"
                onClick={() => setShowAddress((v) => !v)}
              >
                Address & contact {showAddress ? "-" : "+"}
              </button>
              {showAddress && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm sm:col-span-2">
                    Address
                    <input
                      className="sf-input mt-1"
                      placeholder="Street, building, unit"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    City
                    <input
                      className="sf-input mt-1"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    Country
                    <input
                      className="sf-input mt-1"
                      value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    Phone
                    <input
                      className="sf-input mt-1"
                      placeholder="+254..."
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="sf-btn sf-btn-ghost"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sf-btn sf-btn-primary"
                disabled={saving}
                onClick={save}
              >
                {saving ? "Saving..." : editing ? "Save changes" : "Add branch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
