"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { formatKes, formatKesAmount } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import { formatSessionWhen, varianceClass } from "@/lib/cash-ui";
import { CashMoveModal } from "@/components/cash/cash-move-modal";
import { CloseDrawerModal } from "@/components/cash/close-drawer-modal";
import { OpenDrawerModal } from "@/components/cash/open-drawer-modal";
import { SessionDetailModal } from "@/components/cash/session-detail-modal";
import { useCash } from "@/components/cash/use-cash";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

export default function DrawerSessionsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading…</p>}>
      <DrawerSessionsInner />
    </Suspense>
  );
}

function DrawerSessionsInner() {
  const { data: auth } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  const canPickBranch = auth?.user?.role === Role.ADMIN || auth?.user?.role === Role.MANAGER;

  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [userId, setUserId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const cash = useCash({ branchId, from, to, status, userId });
  const resolvedBranchId = branchId || cash.data?.branch?.id || "";
  const actionReady = Boolean(action) && !cash.loading;
  const showOpen = actionReady && action === "open";
  const showClose = actionReady && action === "close";
  const showMove = actionReady && action === "move";

  useEffect(() => {
    setPage(1);
  }, [branchId, from, to, status, userId, q, pageSize]);

  function clearActionParam() {
    if (action) router.replace("/cash/drawer-sessions");
  }

  const sessions = useMemo(() => {
    const rows = cash.data?.sessions || [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((s) => {
      const hay = [
        s.branch?.name,
        s.openedBy.name,
        s.openedBy.email,
        s.closedBy?.name,
        s.note,
        s.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [cash.data?.sessions, q]);

  const pageCount = Math.max(1, Math.ceil(sessions.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = sessions.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(safePage * pageSize, sessions.length);
  const pagedSessions = sessions.slice((safePage - 1) * pageSize, safePage * pageSize);

  const stats = useMemo(() => {
    const all = cash.data?.sessions || [];
    const closed = all.filter((s) => s.status === "CLOSED");
    const openCount = all.filter((s) => s.status === "OPEN").length;
    const balanced = closed.filter((s) => Math.abs(s.cashDifference || 0) < 0.005).length;
    const netVar = closed.reduce((s, r) => s + (r.cashDifference || 0), 0);
    const deposited = closed.reduce((s, r) => s + (r.countedCash || 0), 0);
    return {
      total: all.length,
      openCount,
      balancedPct: closed.length ? Math.round((balanced / closed.length) * 100) : 0,
      balancedOf: `${balanced} of ${closed.length} closed`,
      netVar,
      deposited,
    };
  }, [cash.data?.sessions]);

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
    a.download = `drawer-sessions-${resolvedBranchId || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const open = cash.data?.open;
  const netMoves = (cash.data?.cashIn || 0) - (cash.data?.cashOut || 0);

  return (
    <div className="space-y-3">
      {cash.error && !showClose && !showOpen ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {cash.error}
        </p>
      ) : null}

      <section className="rounded-xl border border-[var(--sf-border)] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`grid size-8 place-items-center rounded-full text-[10px] font-bold ${
              open
                ? "bg-[var(--sf-accent-soft)] text-[var(--sf-accent-deep)]"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {initials(open?.openedBy.name || auth?.user?.name || cash.branchName || "?")}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-[var(--sf-brand)]">
                {open?.openedBy.name || auth?.user?.name || "Cashier"}
              </p>
              {open ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  Open
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  Closed
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--sf-muted)]">
              {open
                ? `${open.branch?.name || cash.branchName} · opened ${formatSessionWhen(open.createdAt)}`
                : `${cash.branchName} · no open drawer`}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            {
              label: "Opening float",
              value: formatKes(open?.openingFloat || 0),
            },
            { label: "Cash sales", value: formatKes(cash.data?.cashSales || 0) },
            { label: "Refunds", value: formatKes(cash.data?.cashRefunds || 0) },
            { label: "Cash out / in", value: formatKes(netMoves) },
            {
              label: "Expected now",
              value: formatKes(open ? cash.expectedCash || open.openingFloat : 0),
              accent: true,
            },
          ].map((m) => (
            <div key={m.label} className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                {m.label}
              </p>
              <p
                className={`mt-0.5 truncate font-mono text-xs font-bold tabular-nums ${
                  m.accent ? "text-[var(--sf-accent-deep)]" : "text-[var(--sf-brand)]"
                }`}
              >
                {m.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Sessions",
            value: String(stats.total),
            note: `${stats.openCount} open`,
            tone: "text-[var(--sf-brand)]",
          },
          {
            label: "Balanced",
            value: `${stats.balancedPct}%`,
            note: stats.balancedOf,
            tone: "text-emerald-700",
          },
          {
            label: "Net variance",
            value: formatKes(stats.netVar),
            note: stats.netVar < -0.005 ? "Cash short overall" : stats.netVar > 0.005 ? "Cash over overall" : "On target",
            tone: varianceClass(stats.netVar),
          },
          {
            label: "Deposited",
            value: formatKes(stats.deposited),
            note: "Counted at close",
            tone: "text-[var(--sf-brand)]",
          },
        ].map((c) => (
          <div
            key={c.label}
            className="min-w-0 rounded-xl border border-[var(--sf-border)] bg-white p-3 shadow-sm"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
              {c.label}
            </p>
            <p className={`mt-1 truncate font-mono text-lg font-extrabold tracking-tight ${c.tone}`}>
              {c.value}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-[var(--sf-muted)]">{c.note}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--sf-border)] bg-white shadow-sm">
        <div className="border-b border-slate-100 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] font-semibold text-[var(--sf-muted)]">
              Branch
              <select
                className="mt-1 block min-w-[7.5rem] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-[var(--sf-brand)] outline-none focus:border-sky-400 focus:bg-white"
                value={resolvedBranchId}
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
            <label className="text-[10px] font-semibold text-[var(--sf-muted)]">
              Status
              <select
                className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-sky-400 focus:bg-white"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">All</option>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </select>
            </label>
            <label className="text-[10px] font-semibold text-[var(--sf-muted)]">
              User
              <select
                className="mt-1 block min-w-[7.5rem] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-sky-400 focus:bg-white"
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
            <label className="text-[10px] font-semibold text-[var(--sf-muted)]">
              From
              <input
                type="date"
                className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-sky-400 focus:bg-white"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-[10px] font-semibold text-[var(--sf-muted)]">
              To
              <input
                type="date"
                className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-sky-400 focus:bg-white"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label className="min-w-[10rem] flex-1 text-[10px] font-semibold text-[var(--sf-muted)]">
              Search
              <input
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-sky-400 focus:bg-white"
                placeholder="Cashier, note…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="inline-flex items-center rounded-lg border border-[var(--sf-border)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--sf-brand)] shadow-sm hover:bg-[var(--sf-surface-2)] disabled:opacity-40"
              onClick={exportCsv}
              disabled={!sessions.length}
            >
              Export CSV
            </button>
          </div>
        </div>

        {cash.loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Loading…</p>
        ) : !sessions.length ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No sessions match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] table-fixed text-xs">
              <colgroup>
                <col className="w-[9%]" />
                <col className="w-[13%]" />
                <col className="w-[14%]" />
                <col className="w-[13%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
                <col className="w-[2%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[9px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                  <th className="px-2.5 py-2 text-left">Branch</th>
                  <th className="px-2 py-2 text-left">Opened</th>
                  <th className="px-2 py-2 text-left">Opened by</th>
                  <th className="px-2 py-2 text-left">Closed</th>
                  <th className="px-2 py-2 text-left">Closed by</th>
                  <th className="px-2 py-2 text-right">Opening</th>
                  <th className="px-2 py-2 text-right">Expected</th>
                  <th className="px-2 py-2 text-right">Counted</th>
                  <th className="px-2 py-2 text-right">Variance</th>
                  <th className="px-1 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedSessions.map((s) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer odd:bg-white even:bg-slate-50/60 hover:bg-slate-100/70"
                    onClick={() => cash.openDetail(s.id)}
                  >
                    <td className="truncate px-2.5 py-2 font-semibold text-[var(--sf-brand)]">
                      {s.branch?.name || "—"}
                    </td>
                    <td className="truncate px-2 py-2 text-slate-600">
                      {formatSessionWhen(s.createdAt)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-600">
                          {initials(s.openedBy.name)}
                        </span>
                        <p className="truncate font-medium text-[var(--sf-brand)]">
                          {s.openedBy.name}
                        </p>
                      </div>
                    </td>
                    <td className="truncate px-2 py-2">
                      {s.status === "OPEN" ? (
                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          Open
                        </span>
                      ) : s.closedAt ? (
                        formatSessionWhen(s.closedAt)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="truncate px-2 py-2 text-slate-600">
                      {s.status === "OPEN" ? "—" : s.closedBy?.name || "—"}
                    </td>
                    <td className="truncate px-2 py-2 text-right font-mono tabular-nums">
                      {formatKesAmount(s.openingFloat)}
                    </td>
                    <td className="truncate px-2 py-2 text-right font-mono tabular-nums">
                      {s.expectedCash == null ? "—" : formatKesAmount(s.expectedCash)}
                    </td>
                    <td className="truncate px-2 py-2 text-right font-mono tabular-nums">
                      {s.countedCash == null ? "—" : formatKesAmount(s.countedCash)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {s.cashDifference == null ? (
                        "—"
                      ) : Math.abs(s.cashDifference) < 0.005 ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          OK
                        </span>
                      ) : (
                        <span
                          className={`inline-flex max-w-full truncate rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
                            s.cashDifference > 0
                              ? "bg-amber-50 text-amber-800"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {formatKesAmount(s.cashDifference)}
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-2 text-center text-slate-300">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--sf-border)] px-3 py-2.5 text-xs text-[var(--sf-muted)]">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {sessions.length
                ? `Showing ${pageStart} – ${pageEnd} of ${sessions.length}`
                : "Showing 0 of 0"}
            </span>
            <label className="flex items-center gap-1.5">
              Per page
              <select
                className="rounded-md border border-[var(--sf-border)] bg-white px-2 py-1 text-xs"
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
              className="rounded-lg border border-[var(--sf-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--sf-brand)] hover:bg-[var(--sf-surface-2)] disabled:opacity-40"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--sf-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--sf-brand)] hover:bg-[var(--sf-surface-2)] disabled:opacity-40"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </section>


      {showMove && open ? (
        <CashMoveModal
          cashInDrawer={cash.expectedCash || open.openingFloat}
          formulaHint={cash.formulaHint}
          onClose={clearActionParam}
          onSaved={() => cash.load()}
        />
      ) : null}

      {showOpen && !open ? (
        <OpenDrawerModal
          branchName={cash.branchName}
          branches={cash.data?.branches || []}
          canPickBranch={canPickBranch}
          defaultBranchId={resolvedBranchId}
          suggestedOpeningFloat={cash.data?.suggestedOpeningFloat || 0}
          openElsewhere={cash.data?.openElsewhere || []}
          busy={cash.busy}
          error={cash.error}
          onClose={() => {
            clearActionParam();
            cash.setError("");
          }}
          onConfirm={async (openingFloat, pickBranchId) => {
            const ok = await cash.openDay(openingFloat, pickBranchId);
            if (ok) clearActionParam();
            return ok;
          }}
        />
      ) : null}

      {showClose && open ? (
        <CloseDrawerModal
          branchName={open.branch?.name || cash.branchName}
          openingFloat={open.openingFloat}
          cashSales={cash.data?.cashSales || 0}
          cashRefunds={cash.data?.cashRefunds || 0}
          cashOut={cash.data?.cashOut || 0}
          cashIn={cash.data?.cashIn || 0}
          expectedCash={cash.expectedCash || open.openingFloat}
          expectedMpesa={cash.data?.expectedMpesa || 0}
          busy={cash.busy}
          error={cash.error}
          onClose={() => {
            clearActionParam();
            cash.setError("");
          }}
          onConfirm={async (input) => {
            const closed = await cash.closeDay(input);
            if (closed?.id) {
              clearActionParam();
              await cash.openDetail(closed.id);
            }
          }}
        />
      ) : null}

      {cash.detail || cash.detailLoading ? (
        <SessionDetailModal
          detail={cash.detail}
          loading={cash.detailLoading}
          onClose={() => cash.setDetail(null)}
        />
      ) : null}
    </div>
  );
}

