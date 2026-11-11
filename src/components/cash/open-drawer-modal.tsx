"use client";

import { useEffect, useState } from "react";
import { formatKes } from "@/lib/money";
import type { BranchRef } from "@/lib/cash-ui";
import {
  DenominationCounter,
  DrawerModalShell,
  emptyDenomCounts,
  sumDenoms,
} from "@/components/cash/drawer-modal-shared";

export function OpenDrawerModal({
  branchName,
  branches,
  canPickBranch,
  defaultBranchId,
  suggestedOpeningFloat = 0,
  openElsewhere,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  branchName: string;
  branches: BranchRef[];
  canPickBranch: boolean;
  defaultBranchId: string;
  suggestedOpeningFloat?: number;
  openElsewhere: {
    id: string;
    openingFloat: number;
    branch: BranchRef | null;
    openedBy: { name: string };
  }[];
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (openingFloat: number, branchId?: string) => Promise<boolean>;
}) {
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [floatRaw, setFloatRaw] = useState(
    suggestedOpeningFloat > 0 ? String(suggestedOpeningFloat) : "0"
  );
  const [showCount, setShowCount] = useState(false);
  const [counts, setCounts] = useState(emptyDenomCounts);

  useEffect(() => {
    if (defaultBranchId) setBranchId(defaultBranchId);
  }, [defaultBranchId]);

  useEffect(() => {
    if (suggestedOpeningFloat > 0) {
      setFloatRaw(String(suggestedOpeningFloat));
    }
  }, [suggestedOpeningFloat]);

  const selectedBranch =
    branches.find((b) => b.id === branchId)?.name || branchName;
  const openingFloat = Math.max(0, Number(floatRaw) || 0);
  const fromLastClose = suggestedOpeningFloat > 0;

  function setCount(denom: number, next: number) {
    setCounts((prev) => {
      const updated = { ...prev, [denom]: Math.max(0, Math.floor(next) || 0) };
      setFloatRaw(String(sumDenoms(updated)));
      return updated;
    });
  }

  return (
    <DrawerModalShell
      titleId="open-drawer-title"
      title="Open drawer"
      subtitle={`Set the opening float for ${selectedBranch}.`}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy}
          className="w-full rounded-xl bg-[var(--sf-accent)] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-[var(--sf-accent-deep)] disabled:opacity-50"
          onClick={async () => {
            const ok = await onConfirm(
              openingFloat,
              canPickBranch ? branchId || undefined : undefined
            );
            if (ok) onClose();
          }}
        >
          {busy ? "Opening…" : "Open the till"}
        </button>
      }
    >
      {openElsewhere.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <p className="font-semibold">Open tills at other branches</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {openElsewhere.map((s) => (
              <li key={s.id}>
                {s.branch?.name} · {s.openedBy.name} · float {formatKes(s.openingFloat)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canPickBranch && branches.length > 0 ? (
        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--sf-muted)]">
          Branch
          <select
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-[var(--sf-brand)] outline-none focus:border-[var(--sf-accent)] focus:ring-2 focus:ring-[var(--sf-accent-soft)]"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block text-xs font-bold uppercase tracking-wider text-[var(--sf-muted)]">
        Opening float (KSh)
        <input
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-[var(--sf-accent)] focus:ring-2 focus:ring-[var(--sf-accent-soft)]"
          inputMode="decimal"
          value={floatRaw}
          onChange={(e) => setFloatRaw(e.target.value)}
          autoFocus
        />
      </label>
      {fromLastClose ? (
        <p className="-mt-2 text-xs text-[var(--sf-muted)]">
          Prefilled from last close · left in drawer {formatKes(suggestedOpeningFloat)}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          onClick={() => setShowCount((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-sm font-semibold text-[var(--sf-brand)] hover:bg-slate-100"
        >
          <span>{showCount ? "Hide note count" : "Count notes"}</span>
          <span className="text-xs font-medium text-[var(--sf-muted)]">
            {showCount ? "▲" : "▼"}
          </span>
        </button>
        {showCount ? (
          <div className="mt-3">
            <DenominationCounter
              counts={counts}
              onChange={setCount}
              label="Count opening float"
            />
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </DrawerModalShell>
  );
}
