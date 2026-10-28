"use client";

import { useEffect, useMemo, useState } from "react";

type BranchOpt = { id: string; name: string; code: string; active: boolean };

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  mustChangePassword?: boolean;
  branchId: string | null;
  branch?: { id: string; code: string; name: string } | null;
  createdAt?: string;
};

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "ATTENDANT",
  branchId: "",
};

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "ATTENDANT", label: "Attendant" },
] as const;

const PAGE_SIZE = 9;

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

function roleBadge(role: string) {
  switch (role) {
    case "ADMIN":
      return { label: "Admin", className: "bg-rose-100 text-rose-700" };
    case "MANAGER":
      return { label: "Manager", className: "bg-sky-100 text-sky-700" };
    default:
      return { label: "Attendant", className: "bg-slate-100 text-slate-600" };
  }
}

function statusBadge(u: UserRow) {
  if (!u.active) return { label: "Suspended", className: "bg-rose-100 text-rose-700" };
  if (u.mustChangePassword) return { label: "Pending", className: "bg-amber-100 text-amber-800" };
  return { label: "Active", className: "bg-emerald-100 text-emerald-700" };
}

function formatCreated(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function IconSearch({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

function IconPlus({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconEdit({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function IconTrash({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [branches, setBranches] = useState<BranchOpt[]>([]);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/users");
    if (!res.ok) {
      setError("Admin access required");
      setUsers([]);
      setLoading(false);
      return;
    }
    setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/branches")
      .then((r) => r.json())
      .then((list) =>
        setBranches(Array.isArray(list) ? list.filter((b: BranchOpt) => b.active) : [])
      )
      .catch(() => setBranches([]));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (!term) return true;
      return (
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.role.toLowerCase().includes(term)
      );
    });
  }, [users, q, roleFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function openEdit(u: UserRow) {
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      branchId: u.branchId || "",
    });
    setError("");
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    if (editing) {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          name: form.name.trim(),
          role: form.role,
          branchId: form.branchId || null,
          ...(form.password ? { password: form.password } : {}),
        }),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok) {
        setError(data.error || "Failed to update user");
        return;
      }
    } else {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          email: form.email.trim(),
          branchId: form.branchId || null,
        }),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok) {
        setError(data.error || "Failed to create user");
        return;
      }
    }

    setShowForm(false);
    setForm(emptyForm);
    setEditing(null);
    load();
  }

  async function suspend(u: UserRow) {
    if (!confirm(`Suspend ${u.name}? They will not be able to sign in.`)) return;
    await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, active: false }),
    });
    load();
  }

  async function activate(u: UserRow) {
    await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, active: true }),
    });
    load();
  }

  const pageButtons = useMemo(() => {
    const max = Math.min(pageCount, 5);
    const start = Math.min(Math.max(0, safePage - 2), Math.max(0, pageCount - max));
    return Array.from({ length: max }, (_, i) => start + i);
  }, [pageCount, safePage]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="sf-card overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <h1 className="mr-auto text-lg font-semibold tracking-tight text-slate-900">
            User Directory
          </h1>

          <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              <IconSearch />
            </span>
            <input
              className="sf-input w-full pl-9"
              placeholder="Search users"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </label>

          <select
            className="sf-input w-auto min-w-[8.5rem]"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(0);
            }}
            aria-label="Filter by role"
          >
            <option value="ALL">All roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          <button type="button" className="sf-btn sf-btn-primary gap-1.5" onClick={openCreate}>
            <IconPlus className="h-3.5 w-3.5" />
            New user
          </button>
        </div>

        {error && !showForm && (
          <p className="sf-alert sf-alert-error mx-5 mt-4">{error}</p>
        )}

        {loading ? (
          <p className="px-5 py-16 text-center text-sm text-slate-500">Loading users…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((u) => {
                  const role = roleBadge(u.role);
                  const status = statusBadge(u);
                  return (
                    <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span
                            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${avatarTone(u.id)}`}
                          >
                            {initials(u.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{u.name}</p>
                            {u.branch?.name && (
                              <p className="truncate text-xs text-slate-400">{u.branch.name}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{u.email}</td>
                      <td className="px-5 py-3.5">
                        <span className={`sf-badge ${role.className}`}>{role.label}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`sf-badge ${status.className}`}>{status.label}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">{formatCreated(u.createdAt)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                            title="Edit"
                            onClick={() => openEdit(u)}
                          >
                            <IconEdit className="h-3.5 w-3.5" />
                          </button>
                          {u.active ? (
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 text-rose-500 hover:bg-rose-50"
                              title="Suspend"
                              onClick={() => suspend(u)}
                            >
                              <IconTrash className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                              title="Activate"
                              onClick={() => activate(u)}
                            >
                              <IconPlus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!pageRows.length && (
                  <tr>
                    <td colSpan={6} className="px-5 py-14 text-center text-slate-500">
                      No users match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5 text-sm text-slate-500">
          <span>
            Showing {from} to {to} of {filtered.length} users
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              «
            </button>
            {pageButtons.map((n) => (
              <button
                key={n}
                type="button"
                className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-medium ${
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              aria-label="Next page"
            >
              »
            </button>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="sf-modal-backdrop">
          <form onSubmit={save} className="sf-modal max-w-md space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              {editing ? "Edit user" : "New user"}
            </h2>
            {error && <p className="sf-alert sf-alert-error">{error}</p>}
            <input
              className="sf-input"
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              className="sf-input"
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              disabled={Boolean(editing)}
            />
            <input
              className="sf-input"
              placeholder={editing ? "New password (optional)" : "Password"}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!editing}
              minLength={editing && !form.password ? undefined : 8}
            />
            <select
              className="sf-input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select
              className="sf-input"
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            >
              <option value="">Home branch (optional)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="sf-btn sf-btn-ghost"
                onClick={() => {
                  setShowForm(false);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button type="submit" className="sf-btn sf-btn-primary" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create user"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
