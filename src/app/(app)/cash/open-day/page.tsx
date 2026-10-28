"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { formatKes } from "@/lib/money";
import { formatSessionWhen } from "@/lib/cash-ui";
import { CashShell } from "@/components/cash/cash-shell";
import { CashMoveModal } from "@/components/cash/cash-move-modal";
import { useCash } from "@/components/cash/use-cash";

export default function OpenDayPage() {
  const { data: auth } = useSession();
  const canPickBranch = auth?.user?.role === Role.ADMIN || auth?.user?.role === Role.MANAGER;
  const cash = useCash();
  const [openingFloat, setOpeningFloat] = useState("0");
  const [branchId, setBranchId] = useState("");

  useEffect(() => {
    if (cash.data?.branch?.id && !branchId) setBranchId(cash.data.branch.id);
  }, [cash.data?.branch?.id, branchId]);

  async function submit() {
    const ok = await cash.openDay(
      Number(openingFloat) || 0,
      canPickBranch ? branchId || undefined : undefined
    );
    if (ok) window.location.href = "/cash/close-day";
  }

  const open = cash.data?.open;
  const branchName = cash.branchName;

  return (
    <CashShell
      tab="open"
      title="Open day"
      description={`Open a cash drawer session for ${branchName} so the till is ready to take payments.`}
      actions={
        open ? (
          <button type="button" className="sf-btn sf-btn-ghost" onClick={() => cash.setShowMove(true)}>
            Cash out / in
          </button>
        ) : undefined
      }
    >
      {cash.error && <p className="sf-alert sf-alert-error">{cash.error}</p>}

      {(cash.data?.openElsewhere?.length || 0) > 0 && (
        <section className="sf-card border-amber-200/80 bg-amber-50/50 p-4 text-sm">
          <h2 className="font-medium text-amber-950">Open tills at other branches</h2>
          <ul className="mt-2 space-y-1">
            {cash.data!.openElsewhere!.map((s) => (
              <li key={s.id}>
                {s.branch?.name} · {s.openedBy.name} · float {formatKes(s.openingFloat)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="sf-card max-w-xl p-5">
        {open ? (
          <>
            <h2 className="text-lg font-semibold text-[var(--sf-brand)]">
              Your session is already open
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              You already have an active drawer session for{" "}
              <strong>{open.branch?.name || branchName}</strong>. You can record sales right away.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-slate-500">Opened at</dt>
              <dd className="font-medium">{formatSessionWhen(open.createdAt)}</dd>
              <dt className="text-slate-500">Opened by</dt>
              <dd className="font-medium">{open.openedBy.name}</dd>
              <dt className="text-slate-500">Opening balance</dt>
              <dd className="font-medium">{formatKes(open.openingFloat)}</dd>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/pos" className="sf-btn sf-btn-primary">
                Go to POS
              </Link>
              <Link href="/cash/close-day" className="sf-btn sf-btn-ghost">
                Close day
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-semibold text-[var(--sf-brand)]">
              Open drawer - {branchName}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Opening binds POS and stock to this branch until you close. One open session per
              branch.
            </p>
            {canPickBranch && (cash.data?.branches?.length || 0) > 0 && (
              <label className="mt-4 block text-sm font-medium">
                Branch
                <select
                  className="sf-input mt-1"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  {(cash.data?.branches || []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="mt-4 block text-sm font-medium">
              Opening float (KSh)
              <input
                className="sf-input mt-1"
                inputMode="decimal"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="sf-btn sf-btn-primary mt-4"
              disabled={cash.busy}
              onClick={submit}
            >
              {cash.busy ? "Opening..." : "Open the till"}
            </button>
          </>
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
    </CashShell>
  );
}
