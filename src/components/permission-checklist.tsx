"use client";

import { PERMISSION_META, type Permission } from "@/lib/permissions";

export function PermissionChecklist({
  selected,
  onChange,
  locked,
}: {
  selected: string[];
  onChange: (next: Permission[]) => void;
  locked?: boolean;
}) {
  const set = new Set(selected);

  function toggle(key: Permission) {
    if (locked) return;
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(PERMISSION_META.map((m) => m.key).filter((k) => next.has(k)));
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {PERMISSION_META.map((item) => {
        const on = set.has(item.key);
        return (
          <button
            key={item.key}
            type="button"
            disabled={locked}
            onClick={() => toggle(item.key)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-[11px] font-medium transition ${
              on
                ? "border-[#c7d6f2] bg-[#f0f5ff] text-slate-900"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            } ${locked ? "cursor-not-allowed opacity-70" : ""}`}
          >
            <span
              className={`grid size-3.5 shrink-0 place-items-center rounded ${
                on ? "bg-slate-900 text-white" : "border border-slate-300 bg-white"
              }`}
              aria-hidden
            >
              {on ? (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2.5 6.5 5 9l4.5-5.5" />
                </svg>
              ) : null}
            </span>
            <span className="leading-snug">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
