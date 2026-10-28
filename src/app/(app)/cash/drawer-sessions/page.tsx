"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { formatKes } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import {
  formatSessionWhen,
  varianceClass,
} from "@/lib/cash-ui";
import { CashShell } from "@/components/cash/cash-shell";
import { CashMoveModal } from "@/components/cash/cash-move-modal";
import { SessionDetailModal } from "@/components/cash/session-detail-modal";
import { useCash } from "@/components/cash/use-cash";

export default function DrawerSessionsPage() {
  const { data: auth } = useSession();
  const canPickBranch = auth?.user?.role === Role.ADMIN || auth?.user?.role === Role.MANAGER;

  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [userId, setUserId] = useState("");

  const cash = useCash({ branchId, from, to, status, userId });

  useEffect(() => {
    if (!branchId && cash.data?.branch?.id) setBranchId(cash.data.branch.id);
  }, [cash.data?.branch?.id, branchId]);

  const sessions = cash.data?.sessions || [];
  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    const b = cash.data?.branches?.find((x) => x.id === branchId);
    if (b) chips.push({ key: "branch", label: `Branch: ${b.name}`, clear: () => setBranchId(cash.data?.branch?.id || "") });
    if (from) chips.push({ key: "from", label: `From: ${from}`, clear: () => setFrom("") });
    if (to) chips.push({ key: "to", label: `To: ${to}`, clear: () => setTo("") });
    if (status !== "all") chips.push({ key: "status", label: `Status: ${status}`, clear: () => setStatus("all") });
    if (userId) {
      const u = cash.data?.staff?.find((s) => s.id === userId);
      chips.push({
        key: "user",
        label: `User: ${u?.name || "Selected"}`,
        clear: () => setUserId(""),
      });
    }
    return chips;
  }, [branchId, from, to, status, userId, cash.data?.branches, cash.data?.staff, cash.data?.branch?.id]);

  function clearAll() {
    setFrom("");
    setTo("");
    setStatus("all");
    setUserId("");
    if (cash.data?.branch?.id) setBranchId(cash.data.branch.id);
  }

  function exportCsv() {
    const rows = sessions.map((s) => ({
      branch: s.branch?.name || "",
      opened: s.createdAt,
      opened_by: s.openedBy.name,
      closed: s.closedAt || "",
      closed_by: s.closedBy?.name || "",
      opening: s.openingFloat,
      expected_cash: s.expectedCash ?? "",
      counted_cash: s.countedCash ?? "",
      cash_variance: s.cashDifference ?? "",
      expected_mpesa: s.expectedMpesa ?? "",
      counted_mpesa: s.countedMpesa ?? "",
      mpesa_variance: s.mpesaDifference ?? "",
      status: s.status,
      note: s.note || "",
    }));
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drawer-sessions-${branchId || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const open = cash.data?.open;

  return (
    <CashShell
      tab="sessions"
      title="Drawer sessions"
      description="History of cash drawer opens and closes. Click a row to see the full Z-report and adjustments."
      actions={
        open ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="sf-btn sf-btn-ghost" onClick={() => cash.setShowMove(true)}>
              Cash out / in
            </button>
            <Link href="/cash/close-day" className="sf-btn sf-btn-primary">
              Close day
            </Link>
          </div>
        ) : (
          <Link href="/cash/open-day" className="sf-btn sf-btn-primary">
            Open day
          </Link>
        )
      }
    >
      {cash.error && <p className="sf-alert sf-alert-error">{cash.error}</p>}

      <section className="sf-card p-4">
        <h3 className="font-semibold text-[var(--sf-brand)]">Filters</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Narrow by branch, date range, status, or user.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium">
            Branch
            <select
              className="sf-input mt-1"
              value={branchId}
              disabled={!canPickBranch}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {(cash.data?.branches || []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            From
            <input
              type="date"
              className="sf-input mt-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            To
            <input
              type="date"
              className="sf-input mt-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Status
            <select
              className="sf-input mt-1"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            User
            <select
              className="sf-input mt-1"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">All users</option>
              {(cash.data?.staff || []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Active filters:</span>
            {activeFilters.map((c) => (
              <button
                key={c.key}
                type="button"
                className="sf-badge bg-slate-100 text-slate-700"
                onClick={c.clear}
              >
                {c.label} x
              </button>
            ))}
            <button type="button" className="text-xs font-medium text-slate-500 hover:underline" onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}
      </section>

      <section className="sf-card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-4">
          <div>
            <h3 className="font-semibold text-[var(--sf-brand)]">Sessions</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {sessions.length} session{sessions.length === 1 ? "" : "s"} matched
              {cash.data?.filterBranch ? ` at ${cash.data.filterBranch.name}` : ""}
            </p>
          </div>
          <button type="button" className="sf-btn sf-btn-ghost" onClick={exportCsv} disabled={!sessions.length}>
            Export CSV
          </button>
        </div>
        {cash.loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Loading...</p>
        ) : !sessions.length ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No sessions match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="sf-thead">
                <tr>
                  <th className="px-3 py-2.5 text-left">Branch</th>
                  <th className="px-3 py-2.5 text-left">Opened</th>
                  <th className="px-3 py-2.5 text-left">Opened by</th>
                  <th className="px-3 py-2.5 text-left">Closed</th>
                  <th className="px-3 py-2.5 text-left">Closed by</th>
                  <th className="px-3 py-2.5 text-right">Opening</th>
                  <th className="px-3 py-2.5 text-right">Expected</th>
                  <th className="px-3 py-2.5 text-right">Counted</th>
                  <th className="px-3 py-2.5 text-right">Variance</th>
                  <th className="px-3 py-2.5 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    className="sf-row cursor-pointer hover:bg-teal-50/40"
                    onClick={() => cash.openDetail(s.id)}
                  >
                    <td className="px-3 py-2.5 font-medium">{s.branch?.name || "-"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {formatSessionWhen(s.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div>{s.openedBy.name}</div>
                      {s.openedBy.email && (
                        <div className="text-xs text-slate-500">{s.openedBy.email}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {s.status === "OPEN"
                        ? "OPEN"
                        : s.closedAt
                          ? formatSessionWhen(s.closedAt)
                          : "-"}
                    </td>
                    <td className="px-3 py-2.5">
                      {s.status === "OPEN" ? "-" : s.closedBy?.name || "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatKes(s.openingFloat)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {s.expectedCash == null ? "-" : formatKes(s.expectedCash)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {s.countedCash == null ? "-" : formatKes(s.countedCash)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium ${varianceClass(s.cashDifference)}`}
                    >
                      {s.cashDifference == null ? "-" : formatKes(s.cashDifference)}
                    </td>
                    <td className="px-3 py-2.5 max-w-[10rem] truncate text-slate-500" title={s.note || ""}>
                      {s.note || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {cash.showMove && open && (
        <CashMoveModal
          cashInDrawer={cash.expectedCash || open.openingFloat}
          formulaHint={cash.formulaHint}
          onClose={() => cash.setShowMove(false)}
          onSaved={() => cash.load()}
        />
      )}
      {(cash.detail || cash.detailLoading) && (
        <SessionDetailModal
          detail={cash.detail}
          loading={cash.detailLoading}
          onClose={() => cash.setDetail(null)}
        />
      )}
    </CashShell>
  );
}
