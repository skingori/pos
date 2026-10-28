"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { formatKes } from "@/lib/money";
import { formatSessionWhen, varianceClass } from "@/lib/cash-ui";
import { CashShell } from "@/components/cash/cash-shell";
import { SessionDetailModal } from "@/components/cash/session-detail-modal";
import { useCash } from "@/components/cash/use-cash";

type ReconView = "unresolved" | "resolved";

function hasVariance(s: {
  cashDifference: number | null;
  mpesaDifference: number | null;
  status: string;
}) {
  if (s.status !== "CLOSED") return false;
  return (
    (s.cashDifference != null && Math.abs(s.cashDifference) >= 0.005) ||
    (s.mpesaDifference != null && Math.abs(s.mpesaDifference) >= 0.005)
  );
}

export default function ReconciliationPage() {
  const { data: auth } = useSession();
  const canPickBranch = auth?.user?.role === Role.ADMIN || auth?.user?.role === Role.MANAGER;
  const [branchId, setBranchId] = useState("");
  const [view, setView] = useState<ReconView>("unresolved");
  const cash = useCash({
    branchId,
    status: "CLOSED",
  });

  useEffect(() => {
    if (!branchId && cash.data?.branch?.id) setBranchId(cash.data.branch.id);
  }, [cash.data?.branch?.id, branchId]);

  const closed = useMemo(
    () => (cash.data?.sessions || []).filter((s) => s.status === "CLOSED"),
    [cash.data?.sessions]
  );

  const unresolved = closed.filter(hasVariance);
  const resolved = closed.filter((s) => !hasVariance(s));
  const rows = view === "unresolved" ? unresolved : resolved;

  return (
    <CashShell
      tab="recon"
      title="Reconciliation"
      description="Review closed drawer sessions with cash or M-Pesa variance for the selected branch. (Offline late-sync incidents are not used in this build.)"
      actions={
        <Link href="/cash/drawer-sessions" className="sf-btn sf-btn-ghost">
          Drawer sessions
        </Link>
      }
    >
      {cash.error && <p className="sf-alert sf-alert-error">{cash.error}</p>}

      <section className="sf-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="text-sm font-medium">
            Branch
            <select
              className="sf-input mt-1 min-w-[12rem]"
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
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                view === "unresolved"
                  ? "bg-white text-[var(--sf-brand)] shadow-sm"
                  : "text-slate-600"
              }`}
              onClick={() => setView("unresolved")}
            >
              Unresolved ({unresolved.length})
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                view === "resolved"
                  ? "bg-white text-[var(--sf-brand)] shadow-sm"
                  : "text-slate-600"
              }`}
              onClick={() => setView("resolved")}
            >
              Resolved ({resolved.length})
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Unresolved = closed sessions where counted cash or M-Pesa differed from expected.
          Click a row for the Z-report. Add a close note when you investigate a short or over.
        </p>
      </section>

      <section className="sf-card overflow-hidden p-0">
        <div className="border-b border-slate-100 px-4 py-4">
          <h3 className="font-semibold text-[var(--sf-brand)]">
            {view === "unresolved" ? "Unresolved variances" : "Balanced closes"}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {cash.data?.filterBranch?.name || cash.branchName}
          </p>
        </div>
        {cash.loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Loading...</p>
        ) : !rows.length ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No incidents in this view.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sf-thead">
                <tr>
                  <th className="px-3 py-2.5 text-left">Closed</th>
                  <th className="px-3 py-2.5 text-left">Opened by</th>
                  <th className="px-3 py-2.5 text-left">Closed by</th>
                  <th className="px-3 py-2.5 text-right">Cash var.</th>
                  <th className="px-3 py-2.5 text-right">M-Pesa var.</th>
                  <th className="px-3 py-2.5 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    className="sf-row cursor-pointer hover:bg-teal-50/40"
                    onClick={() => cash.openDetail(s.id)}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {s.closedAt ? formatSessionWhen(s.closedAt) : "-"}
                    </td>
                    <td className="px-3 py-2.5">{s.openedBy.name}</td>
                    <td className="px-3 py-2.5">{s.closedBy?.name || "-"}</td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium ${varianceClass(s.cashDifference)}`}
                    >
                      {s.cashDifference == null ? "-" : formatKes(s.cashDifference)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium ${varianceClass(s.mpesaDifference)}`}
                    >
                      {s.mpesaDifference == null ? "-" : formatKes(s.mpesaDifference)}
                    </td>
                    <td className="px-3 py-2.5 max-w-[12rem] truncate text-slate-500">
                      {s.note || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
