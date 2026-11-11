"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { PermissionChecklist } from "@/components/permission-checklist";
import { hasPermission, ROLE_DEFAULT_PERMISSIONS, type Permission } from "@/lib/permissions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type BranchOpt = { id: string; name: string; code: string; active: boolean };

type AccessGroupRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  groupId?: string | null;
  group?: { id: string; name: string; code: string; isSystem: boolean } | null;
  active: boolean;
  mustChangePassword?: boolean;
  branchId: string | null;
  branch?: { id: string; code: string; name: string } | null;
  createdAt?: string;
  permissions?: string[];
};

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "ATTENDANT",
  groupId: "",
  branchId: "",
  permissions: [...ROLE_DEFAULT_PERMISSIONS.ATTENDANT] as Permission[],
};

const PAGE_SIZE = 9;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function groupBadge(u: UserRow) {
  const label = u.group?.name || u.role;
  const code = u.group?.code || u.role;
  switch (code) {
    case "ADMIN":
      return { label, className: "bg-[#fff0f0] text-[#be1c1c]", avatar: "bg-[#fff0f0] text-[#be1c1c]" };
    case "MANAGER":
      return { label, className: "bg-[#e0f2ff] text-[#036699]", avatar: "bg-[#e0f2ff] text-[#036699]" };
    case "ATTENDANT":
      return { label, className: "bg-[#f2f5f7] text-[#63738b]", avatar: "bg-[#f2f5f7] text-[#63738b]" };
    default:
      return { label, className: "bg-violet-100 text-violet-700", avatar: "bg-violet-100 text-violet-700" };
  }
}

function statusBadge(u: UserRow) {
  if (!u.active) return { label: "Suspended", className: "bg-[#fff0f0] text-[#be1c1c]" };
  if (u.mustChangePassword) return { label: "Pending", className: "bg-[#fff5e5] text-[#ea580c]" };
  return { label: "Active", className: "bg-[#ecfaf1] text-[#057345]" };
}

export default function UsersPage() {
  const { data: session } = useSession();
  const canEditRoles = hasPermission(session?.user, "roles.manage");
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [branches, setBranches] = useState<BranchOpt[]>([]);
  const [groups, setGroups] = useState<AccessGroupRow[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    permissions: [] as Permission[],
  });
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "active" | "pending" | "suspended">("ALL");
  const [page, setPage] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<
    null | { type: "delete-group"; group: AccessGroupRow } | { type: "suspend"; user: UserRow }
  >(null);

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

  async function loadGroups() {
    const res = await fetch("/api/access-groups");
    if (!res.ok) return;
    const data = await res.json();
    const list = (data.groups || []) as AccessGroupRow[];
    setGroups(list);
    setSelectedGroupId((prev) => {
      if (prev && list.some((g) => g.id === prev)) return prev;
      return list.find((g) => g.code === "ATTENDANT")?.id || list[0]?.id || "";
    });
  }

  useEffect(() => {
    load();
    loadGroups();
    fetch("/api/branches")
      .then((r) => r.json())
      .then((list) =>
        setBranches(Array.isArray(list) ? list.filter((b: BranchOpt) => b.active) : [])
      )
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    const g = groups.find((x) => x.id === selectedGroupId);
    if (!g || creatingGroup) return;
    setGroupForm({
      name: g.name,
      description: g.description || "",
      permissions: g.permissions as Permission[],
    });
  }, [selectedGroupId, groups, creatingGroup]);

  const stats = useMemo(
    () => ({
      people: users.length,
      active: users.filter((u) => u.active).length,
      groups: groups.length,
      pending: users.filter((u) => u.mustChangePassword).length,
    }),
    [users, groups]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "ALL") {
        const code = u.group?.code || u.role;
        if (roleFilter !== code && roleFilter !== u.groupId) return false;
      }
      if (statusFilter === "active" && (!u.active || u.mustChangePassword)) return false;
      if (statusFilter === "pending" && !u.mustChangePassword) return false;
      if (statusFilter === "suspended" && u.active) return false;
      if (!term) return true;
      return (
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.role.toLowerCase().includes(term) ||
        (u.group?.name || "").toLowerCase().includes(term)
      );
    });
  }, [users, q, roleFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE);

  function templateForGroup(groupId: string): Permission[] {
    const g = groups.find((x) => x.id === groupId);
    if (g?.permissions?.length) return g.permissions as Permission[];
    return [...ROLE_DEFAULT_PERMISSIONS.ATTENDANT];
  }

  function defaultGroupId() {
    return groups.find((g) => g.code === "ATTENDANT")?.id || groups[0]?.id || "";
  }

  function openCreate() {
    const groupId = defaultGroupId();
    setEditing(null);
    setForm({
      ...emptyForm,
      groupId,
      permissions: templateForGroup(groupId),
    });
    setError("");
    setShowForm(true);
  }

  function openEdit(u: UserRow) {
    const groupId = u.groupId || groups.find((g) => g.code === u.role)?.id || defaultGroupId();
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      groupId,
      branchId: u.branchId || "",
      permissions: (u.permissions?.length
        ? u.permissions
        : templateForGroup(groupId)) as Permission[],
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
          groupId: form.groupId || null,
          branchId: form.branchId || null,
          permissions: form.permissions,
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
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          groupId: form.groupId || null,
          branchId: form.branchId || null,
          permissions: form.permissions,
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

  function startCreateGroup() {
    setCreatingGroup(true);
    setSelectedGroupId("");
    setGroupForm({
      name: "",
      description: "",
      permissions: [...ROLE_DEFAULT_PERMISSIONS.ATTENDANT],
    });
    setError("");
  }

  async function saveGroup() {
    if (!canEditRoles) return;
    if (!groupForm.name.trim()) {
      setError("Group name is required");
      return;
    }
    setSaving(true);
    setError("");
    if (creatingGroup) {
      const res = await fetch("/api/access-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupForm.name.trim(),
          description: groupForm.description.trim() || null,
          permissions: groupForm.permissions,
        }),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok) {
        setError(data.error || "Failed to create group");
        return;
      }
      setCreatingGroup(false);
      await loadGroups();
      setSelectedGroupId(data.id);
      return;
    }
    const res = await fetch("/api/access-groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedGroupId,
        name: groupForm.name.trim(),
        description: groupForm.description.trim() || null,
        permissions: groupForm.permissions,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Failed to save group");
      return;
    }
    await loadGroups();
  }

  function askDeleteGroup() {
    const g = groups.find((x) => x.id === selectedGroupId);
    if (!g || g.isSystem) return;
    setConfirmAction({ type: "delete-group", group: g });
  }

  async function runDeleteGroup(g: AccessGroupRow) {
    setSaving(true);
    const res = await fetch(`/api/access-groups?id=${g.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setConfirmAction(null);
      setError(data.error || "Could not delete group");
      return;
    }
    setConfirmAction(null);
    await loadGroups();
  }

  function askSuspend(u: UserRow) {
    setConfirmAction({ type: "suspend", user: u });
  }

  async function runSuspend(u: UserRow) {
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, active: false }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setConfirmAction(null);
      setError(data.error || "Could not suspend user");
      return;
    }
    setConfirmAction(null);
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

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const pageButtons = useMemo(() => {
    const max = Math.min(pageCount, 5);
    const start = Math.min(Math.max(0, safePage - 2), Math.max(0, pageCount - max));
    return Array.from({ length: max }, (_, i) => start + i);
  }, [pageCount, safePage]);

  const ghostBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50";
  const primaryBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50";
  const suspended = users.filter((u) => !u.active).length;

  return (
    <div className="space-y-4 [font-variant-numeric:tabular-nums]">
      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
        aria-label="Users overview"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              Users & access
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">
                Assign groups, then fine-tune permissions per person
              </span>
              {stats.pending > 0 ? (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  {stats.pending} pending password
                </span>
              ) : null}
              {suspended > 0 ? (
                <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                  {suspended} suspended
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {canEditRoles ? (
              <button
                type="button"
                className={ghostBtn}
                onClick={() => setTab(tab === "roles" ? "users" : "roles")}
              >
                {tab === "roles" ? "Users" : "Roles & groups"}
              </button>
            ) : null}
            {tab === "users" ? (
              <button type="button" className={primaryBtn} onClick={openCreate}>
                + New user
              </button>
            ) : (
              <button type="button" className={primaryBtn} onClick={startCreateGroup}>
                + New group
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 border-t border-slate-200 lg:grid-cols-4 lg:divide-y-0">
          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              tab === "users" && statusFilter === "ALL" && roleFilter === "ALL"
                ? "bg-indigo-50/60"
                : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setTab("users");
              setStatusFilter("ALL");
              setRoleFilter("ALL");
              setPage(0);
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">People</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {stats.people}
              </span>
              <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700">
                accounts
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {stats.active} active · {suspended} suspended
            </p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              View directory →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              tab === "users" && statusFilter === "active" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setTab("users");
              setStatusFilter("active");
              setPage(0);
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Active</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {stats.active}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {stats.people ? Math.round((stats.active / stats.people) * 100) : 0}% of directory
            </p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Filter active →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              tab === "roles" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              if (canEditRoles) setTab("roles");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Groups</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {stats.groups}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {groups.filter((g) => g.isSystem).length} system ·{" "}
              {groups.filter((g) => !g.isSystem).length} custom
            </p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Manage groups →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              tab === "users" && statusFilter === "pending" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setTab("users");
              setStatusFilter("pending");
              setPage(0);
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Pending password
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span
                className={`font-mono text-base font-bold tracking-tight sm:text-lg ${
                  stats.pending > 0 ? "text-amber-700" : "text-slate-900"
                }`}
              >
                {stats.pending}
              </span>
            </div>
            {stats.pending > 0 ? (
              <p className="mt-1.5 inline-flex items-center self-start rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                Must change on next login
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">All passwords set</p>
            )}
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              View pending →
            </span>
          </button>
        </div>
      </section>

      {tab === "roles" && canEditRoles ? (
        <div className="grid gap-5 lg:grid-cols-[15rem_1fr]">
          <div className="rounded-2xl border border-[#e3e8f0] bg-white p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#63738b]">Groups</p>
              <button
                type="button"
                className="text-[11px] font-semibold text-[#ea580c] hover:underline"
                onClick={startCreateGroup}
              >
                + New
              </button>
            </div>
            <ul className="space-y-1">
              {groups.map((g) => {
                const active = !creatingGroup && selectedGroupId === g.id;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-[13px] ${
                        active
                          ? "bg-slate-900 text-white"
                          : "font-semibold text-slate-900 hover:bg-slate-50"
                      }`}
                      onClick={() => {
                        setCreatingGroup(false);
                        setSelectedGroupId(g.id);
                        setError("");
                      }}
                    >
                      <span className={`truncate ${active ? "font-semibold" : "font-semibold"}`}>
                        {g.name}
                      </span>
                      <span className={`ml-2 shrink-0 text-[11px] ${active ? "text-white/80" : "text-[#63738b]"}`}>
                        {g.userCount}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-4 rounded-2xl border border-[#e3e8f0] bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <h2 className="text-[22px] font-bold text-slate-900">
                  {creatingGroup ? "New group" : selectedGroup?.name || "Group"}
                </h2>
                <p className="text-xs text-[#63738b]">
                  {creatingGroup
                    ? "Create a custom role group with its own permission template."
                    : selectedGroup?.description ||
                      "Template applies to new users in this group."}
                </p>
              </div>
              {!creatingGroup && selectedGroup && !selectedGroup.isSystem ? (
                <button
                  type="button"
                  className="sf-btn sf-btn-ghost text-rose-600"
                  disabled={saving}
                  onClick={askDeleteGroup}
                >
                  Delete
                </button>
              ) : null}
            </div>

            {error ? <p className="sf-alert sf-alert-error">{error}</p> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[11px] font-medium text-[#63738b]">
                Name
                <input
                  className="mt-1.5 w-full rounded-[10px] border border-[#e3e8f0] bg-[#f8fafc] px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400"
                  value={groupForm.name}
                  disabled={!creatingGroup && selectedGroup?.code === "ADMIN"}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                />
              </label>
              <label className="block text-[11px] font-medium text-[#63738b]">
                Description
                <input
                  className="mt-1.5 w-full rounded-[10px] border border-[#e3e8f0] bg-[#f8fafc] px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400"
                  value={groupForm.description}
                  onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                />
              </label>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">Permissions</p>
              <PermissionChecklist
                selected={groupForm.permissions}
                onChange={(permissions) => setGroupForm({ ...groupForm, permissions })}
                locked={!creatingGroup && selectedGroup?.code === "ADMIN"}
              />
            </div>

            <div className="flex justify-end gap-2">
              {creatingGroup ? (
                <button
                  type="button"
                  className="rounded-[10px] border border-[#e3e8f0] bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900"
                  onClick={() => {
                    setCreatingGroup(false);
                    setError("");
                    const fallback =
                      groups.find((g) => g.code === "ATTENDANT")?.id || groups[0]?.id || "";
                    setSelectedGroupId(fallback);
                  }}
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-[10px] bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
                disabled={saving}
                onClick={saveGroup}
              >
                {saving ? "Saving…" : creatingGroup ? "Create group" : "Save group"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "users" ? (
        <>
          {error && !showForm ? <p className="sf-alert sf-alert-error">{error}</p> : null}

          <section
            className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
            aria-label="User directory"
          >
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
              <label className="relative min-w-[160px] flex-1 sm:max-w-xs">
                <span className="sr-only">Search users</span>
                <input
                  type="search"
                  placeholder="Search name, email, or group…"
                  className="h-8 w-full rounded-lg border-0 bg-white px-2.5 text-xs ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <select
                className="h-8 min-w-[140px] appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(0);
                }}
                aria-label="Filter by group"
              >
                <option value="ALL">All groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.code}>
                    {g.name}
                  </option>
                ))}
              </select>
              {statusFilter !== "ALL" ? (
                <button
                  type="button"
                  className={ghostBtn}
                  onClick={() => {
                    setStatusFilter("ALL");
                    setPage(0);
                  }}
                >
                  Clear status filter
                </button>
              ) : null}
              <span className="text-[11px] text-slate-500">
                {filtered.length} user{filtered.length === 1 ? "" : "s"}
                {statusFilter !== "ALL" ? ` · ${statusFilter}` : ""}
              </span>
            </div>

            {loading ? (
              <p className="px-5 py-16 text-center text-sm text-slate-500">Loading users…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2.5 sm:px-4">User</th>
                      <th className="w-[120px] px-3 py-2.5 sm:px-4">Group</th>
                      <th className="w-[100px] px-3 py-2.5 sm:px-4">Status</th>
                      <th className="w-[88px] px-3 py-2.5 text-right sm:px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((u) => {
                      const group = groupBadge(u);
                      const status = statusBadge(u);
                      return (
                        <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                          <td className="px-3 py-3 sm:px-4">
                            <div className="flex items-center gap-3">
                              <span
                                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${group.avatar}`}
                              >
                                {initials(u.name)}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-semibold text-slate-900">
                                  {u.name}
                                </p>
                                <p className="truncate text-[11px] text-slate-500">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 sm:px-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${group.className}`}
                            >
                              {group.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 sm:px-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}
                            >
                              {status.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 sm:px-4">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                className={ghostBtn}
                                onClick={() => openEdit(u)}
                              >
                                Edit
                              </button>
                              {u.active ? (
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50"
                                  onClick={() => askSuspend(u)}
                                  title="Suspend"
                                >
                                  Suspend
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50"
                                  onClick={() => activate(u)}
                                  title="Activate"
                                >
                                  Activate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!pageRows.length ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-14 text-center text-slate-500">
                          No users match your filters
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-2.5 text-sm text-slate-500 sm:px-4">
              <span>
                Showing {from} to {to} of {filtered.length} users
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
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
                    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium ${
                      n === safePage
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                    }`}
                    onClick={() => setPage(n)}
                  >
                    {n + 1}
                  </button>
                ))}
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  aria-label="Next page"
                >
                  »
                </button>
              </div>
            </div>
          </section>

          {showForm ? (
            <div className="sf-modal-backdrop">
              <form
                onSubmit={save}
                className="sf-modal max-h-[min(42rem,calc(100vh-2rem))] max-w-2xl space-y-3 overflow-y-auto"
              >
                <h2 className="text-lg font-semibold tracking-tight">
                  {editing ? "Edit user" : "New user"}
                </h2>
                {error ? <p className="sf-alert sf-alert-error">{error}</p> : null}
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
                  value={form.groupId}
                  onChange={(e) => {
                    const groupId = e.target.value;
                    const g = groups.find((x) => x.id === groupId);
                    setForm({
                      ...form,
                      groupId,
                      role:
                        g?.code === "ADMIN" || g?.code === "MANAGER" || g?.code === "ATTENDANT"
                          ? g.code
                          : "ATTENDANT",
                      permissions: templateForGroup(groupId),
                    });
                  }}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.isSystem ? "" : " (custom)"}
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
                <div className="space-y-3 rounded-xl border border-[#e3e8f0] bg-[#f8fafc] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">Permissions</p>
                    <button
                      type="button"
                      className="text-xs font-medium text-[#ea580c] hover:underline"
                      onClick={() =>
                        setForm({ ...form, permissions: templateForGroup(form.groupId) })
                      }
                    >
                      Reset to group defaults
                    </button>
                  </div>
                  <PermissionChecklist
                    selected={form.permissions}
                    onChange={(permissions) => setForm({ ...form, permissions })}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    className="rounded-[10px] border border-[#e3e8f0] bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900"
                    onClick={() => {
                      setShowForm(false);
                      setError("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-[10px] bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
                    disabled={saving}
                  >
                    {saving ? "Saving…" : editing ? "Save changes" : "Create user"}
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={
          confirmAction?.type === "delete-group"
            ? `Delete group “${confirmAction.group.name}”?`
            : `Suspend ${confirmAction?.user.name || "user"}?`
        }
        message={
          confirmAction?.type === "delete-group"
            ? "Users in this group keep their accounts, but lose these custom permissions."
            : "They will not be able to sign in until activated again."
        }
        confirmLabel={confirmAction?.type === "delete-group" ? "Delete" : "Suspend"}
        tone="danger"
        loading={saving}
        onCancel={() => {
          if (!saving) setConfirmAction(null);
        }}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === "delete-group") runDeleteGroup(confirmAction.group);
          else runSuspend(confirmAction.user);
        }}
      />
    </div>
  );
}
