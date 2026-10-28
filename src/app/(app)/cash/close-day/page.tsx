"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatKes } from "@/lib/money";
import { formatSessionWhen, varianceClass } from "@/lib/cash-ui";
import { CashShell } from "@/components/cash/cash-shell";
import { CashMoveModal } from "@/components/cash/cash-move-modal";
import { SessionDetailModal } from "@/components/cash/session-detail-modal";
import { useCash } from "@/components/cash/use-cash";

export default function CloseDayPage() {
  const cash = useCash();
  const open = cash.data?.open;
  const branchName = cash.branchName;
  const [countedCash, setCountedCash] = useState("");
  const [countedMpesa, setCountedMpesa] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (cash.data?.expectedCash != null) setCountedCash(String(cash.data.expectedCash));
    if (cash.data?.expectedMpesa != null) setCountedMpesa(String(cash.data.expectedMpesa));
  }, [cash.data?.expectedCash, cash.data?.expectedMpesa, open?.id]);

  async function submit() {
    const closed = await cash.closeDay({
      countedCash: Number(countedCash),
      countedMpesa: Number(countedMpesa),
      note,
    });
    if (closed?.id) {
      setConfirm(false);
      await cash.openDetail(closed.id);
    }
  }

  return (
    <CashShell
      tab="close"
      title="Close day"
      description={`Reconcile expected vs counted cash for the open drawer session at ${branchName}.`}
      actions={
        open ? (
          <button type="button" className="sf-btn sf-btn-ghost" onClick={() => cash.setShowMove(true)}>
            Cash out / in
          </button>
        ) : undefined
      }
    >
      {cash.error && <p className="sf-alert sf-alert-error">{cash.error}</p>}

      {!open ? (
        <section className="sf-card max-w-xl p-5">
          <p className="text-sm text-slate-600">
            No open drawer at {branchName}. Open the day first.
          </p>
          <Link href="/cash/open-day" className="sf-btn sf-btn-primary mt-4 inline-flex">
            Open day
          </Link>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="sf-card p-5">
            <h2 className="font-semibold text-[var(--sf-brand)]">Open session</h2>
            <p className="mt-1 text-sm text-slate-500">
              Details of the drawer session you are closing.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-slate-500">Branch</dt>
              <dd className="font-medium">{open.branch?.name || branchName}</dd>
              <dt className="text-slate-500">Opened at</dt>
              <dd className="font-medium">{formatSessionWhen(open.createdAt)}</dd>
              <dt className="text-slate-500">Opened by</dt>
              <dd className="font-medium">{open.openedBy.name}</dd>
              <dt className="text-slate-500">Opening balance</dt>
              <dd className="font-medium">{formatKes(open.openingFloat)}</dd>
            </dl>
            <button
              type="button"
              className="sf-btn sf-btn-ghost mt-4"
              onClick={() => cash.setShowMove(true)}
            >
              Cash out / in
            </button>
          </section>

          <section className="sf-card p-5">
            <h2 className="font-semibold text-[var(--sf-brand)]">Cash drawer breakdown</h2>
            <p className="mt-1 text-sm text-slate-500">
              Every cash-in and cash-out for the open session, plus refunds paid out in cash,
              feeding the expected close formula: opening + cash sales + paid-in - paid-out - cash
              refunds
            </p>
            <ul className="mt-4 space-y-1.5 text-sm">
              <li className="flex justify-between">
                <span>Opening float</span>
                <span>{formatKes(open.openingFloat)}</span>
              </li>
              <li className="flex justify-between">
                <span>Cash sales</span>
                <span>+ {formatKes(cash.data?.cashSales || 0)}</span>
              </li>
              <li className="flex justify-between">
                <span>Paid in</span>
                <span>+ {formatKes(cash.data?.cashIn || 0)}</span>
              </li>
              <li className="flex justify-between">
                <span>Paid out</span>
                <span>- {formatKes(cash.data?.cashOut || 0)}</span>
              </li>
              <li className="flex justify-between">
                <span>Cash refunds</span>
                <span>- {formatKes(cash.data?.cashRefunds || 0)}</span>
              </li>
              <li className="mt-2 flex justify-between border-t border-slate-100 pt-2 font-semibold">
                <span>Expected close (cash)</span>
                <span>{formatKes(cash.data?.expectedCash || 0)}</span>
              </li>
            </ul>
            {(open.movements?.length || 0) === 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                No cash-ins or cash-outs recorded for this session.
              </p>
            ) : (
              <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-xs text-slate-500">
                {open.movements.map((m) => (
                  <li key={m.id}>
                    {m.type} {formatKes(m.amount)}
                    {m.note ? ` - ${m.note}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sf-card p-5">
            <h2 className="font-semibold text-[var(--sf-brand)]">Expected in till (from sales)</h2>
            <p className="mt-1 text-sm text-slate-500">
              Total from sales recorded since this drawer session opened, grouped by payment method.
            </p>
            <ul className="mt-4 space-y-1.5 text-sm">
              <li className="flex justify-between">
                <span>Cash</span>
                <span>{formatKes(cash.data?.cashSales || 0)}</span>
              </li>
              <li className="flex justify-between">
                <span>M-Pesa</span>
                <span>{formatKes(cash.data?.mpesaSales || 0)}</span>
              </li>
            </ul>
            <p className="mt-3 text-sm font-medium">
              Expected total:{" "}
              {formatKes((cash.data?.cashSales || 0) + (cash.data?.mpesaSales || 0))}
            </p>
          </section>

          <section className="sf-card p-5">
            <h2 className="font-semibold text-[var(--sf-brand)]">Counted amounts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter what you actually counted in the till (and M-Pesa, if applicable).
            </p>
            {!confirm ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Counted Cash
                    <input
                      className="sf-input mt-1"
                      inputMode="decimal"
                      value={countedCash}
                      onChange={(e) => setCountedCash(e.target.value)}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Counted Mpesa
                    <input
                      className="sf-input mt-1"
                      inputMode="decimal"
                      value={countedMpesa}
                      onChange={(e) => setCountedMpesa(e.target.value)}
                    />
                  </label>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Counted total:{" "}
                  {formatKes((Number(countedCash) || 0) + (Number(countedMpesa) || 0))}
                </p>
                <label className="mt-3 block text-sm font-medium">
                  Note (optional)
                  <input
                    className="sf-input mt-1"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="sf-btn sf-btn-danger mt-4"
                  onClick={() => setConfirm(true)}
                >
                  Close day
                </button>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                <p className="text-sm font-medium text-rose-900">Confirm close at {branchName}?</p>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>
                    Cash variance{" "}
                    <span
                      className={varianceClass(
                        (Number(countedCash) || 0) - (cash.data?.expectedCash || 0)
                      )}
                    >
                      {formatKes((Number(countedCash) || 0) - (cash.data?.expectedCash || 0))}
                    </span>
                  </li>
                  <li>
                    M-Pesa variance{" "}
                    <span
                      className={varianceClass(
                        (Number(countedMpesa) || 0) - (cash.data?.expectedMpesa || 0)
                      )}
                    >
                      {formatKes((Number(countedMpesa) || 0) - (cash.data?.expectedMpesa || 0))}
                    </span>
                  </li>
                </ul>
                <div className="mt-4 flex gap-2">
                  <button type="button" className="sf-btn sf-btn-ghost" onClick={() => setConfirm(false)}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="sf-btn sf-btn-danger"
                    disabled={cash.busy}
                    onClick={submit}
                  >
                    {cash.busy ? "Closing..." : "Confirm close"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

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
