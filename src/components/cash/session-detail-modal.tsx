"use client";

import { formatKes } from "@/lib/money";
import {
  formatSessionWhen,
  varianceClass,
  type DetailPayload,
} from "@/lib/cash-ui";

export function SessionDetailModal({
  detail,
  loading,
  onClose,
}: {
  detail: DetailPayload | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="sf-modal-backdrop">
      <div className="sf-modal max-w-lg">
        {loading || !detail ? (
          <p className="text-sm text-slate-500">Loading session details...</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Session details</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Per-method reconciliation and recorded adjustments.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                onClick={onClose}
              >
                x
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm">
              <div className="font-medium text-amber-950">
                Opening cash carried in: {formatKes(detail.session.openingFloat)}
              </div>
              <p className="mt-0.5 text-xs text-amber-900/80">
                This amount was already in the drawer before the session started.
              </p>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-slate-500">Branch</dt>
              <dd className="font-medium">{detail.session.branch?.name || "-"}</dd>
              <dt className="text-slate-500">Opened</dt>
              <dd className="font-medium">
                {formatSessionWhen(detail.session.createdAt)} · {detail.session.openedBy.name}
                {detail.session.openedBy.email && (
                  <div className="text-xs font-normal text-slate-500">
                    {detail.session.openedBy.email}
                  </div>
                )}
              </dd>
              <dt className="text-slate-500">Closed</dt>
              <dd className="font-medium">
                {detail.session.closedAt
                  ? `${formatSessionWhen(detail.session.closedAt)}${
                      detail.session.closedBy
                        ? ` · ${detail.session.closedBy.name}`
                        : ""
                    }`
                  : "Still open"}
              </dd>
              <dt className="text-slate-500">Opening balance</dt>
              <dd className="font-medium">{formatKes(detail.session.openingFloat)}</dd>
            </dl>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sf-thead">
                  <tr>
                    <th className="px-2 py-2 text-left">Method</th>
                    <th className="px-2 py-2 text-right">Expected</th>
                    <th className="px-2 py-2 text-right">Counted</th>
                    <th className="px-2 py-2 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="sf-row">
                    <td className="px-2 py-2">Cash</td>
                    <td className="px-2 py-2 text-right">
                      {formatKes(
                        detail.session.status === "CLOSED"
                          ? detail.session.expectedCash || 0
                          : detail.totals.expectedCash
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {detail.session.countedCash == null
                        ? "-"
                        : formatKes(detail.session.countedCash)}
                    </td>
                    <td
                      className={`px-2 py-2 text-right font-medium ${varianceClass(
                        detail.session.cashDifference
                      )}`}
                    >
                      {detail.session.cashDifference == null
                        ? "-"
                        : formatKes(detail.session.cashDifference)}
                    </td>
                  </tr>
                  <tr className="sf-row">
                    <td className="px-2 py-2">M-Pesa</td>
                    <td className="px-2 py-2 text-right">
                      {formatKes(
                        detail.session.status === "CLOSED"
                          ? detail.session.expectedMpesa || 0
                          : detail.totals.expectedMpesa
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {detail.session.countedMpesa == null
                        ? "-"
                        : formatKes(detail.session.countedMpesa)}
                    </td>
                    <td
                      className={`px-2 py-2 text-right font-medium ${varianceClass(
                        detail.session.mpesaDifference
                      )}`}
                    >
                      {detail.session.mpesaDifference == null
                        ? "-"
                        : formatKes(detail.session.mpesaDifference)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-[var(--sf-brand)]">
                Cash drawer breakdown
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                <li className="flex justify-between gap-2">
                  <span>Opening float</span>
                  <span>{formatKes(detail.session.openingFloat)}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>Cash sales</span>
                  <span>+ {formatKes(detail.totals.cashSales)}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>Paid in</span>
                  <span>+ {formatKes(detail.totals.cashIn)}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>Paid out</span>
                  <span>- {formatKes(detail.totals.cashOut)}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>Cash refunds</span>
                  <span>- {formatKes(detail.totals.cashRefunds)}</span>
                </li>
                <li className="mt-2 flex justify-between gap-2 border-t border-slate-100 pt-2 font-semibold">
                  <span>Expected close (cash)</span>
                  <span>{formatKes(detail.totals.expectedCash)}</span>
                </li>
              </ul>
              {detail.session.movements?.length > 0 && (
                <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-slate-500">
                  {detail.session.movements.map((m) => (
                    <li key={m.id}>
                      {m.type === "IN" ? "Paid in" : "Paid out"} {formatKes(m.amount)}
                      {m.note ? ` - ${m.note}` : ""} · {m.user?.name || ""}
                    </li>
                  ))}
                </ul>
              )}
              {detail.session.note && (
                <p className="mt-3 text-sm text-slate-600">Note: {detail.session.note}</p>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button type="button" className="sf-btn sf-btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
