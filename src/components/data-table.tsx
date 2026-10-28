"use client";

import { useMemo, useState } from "react";

type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
};

export function DataTable<T extends { id?: string }>({
  rows,
  columns,
  searchKeys,
  pageSize = 15,
  empty = "No rows",
}: {
  rows: T[];
  columns: Column<T>[];
  searchKeys?: (keyof T)[];
  pageSize?: number;
  empty?: string;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let list = rows;
    if (q.trim() && searchKeys?.length) {
      const term = q.trim().toLowerCase();
      list = list.filter((row) =>
        searchKeys.some((k) => String(row[k] ?? "").toLowerCase().includes(term))
      );
    }
    if (sortKey) {
      const col = columns.find((c) => String(c.key) === sortKey);
      list = [...list].sort((a, b) => {
        const av = col?.sortValue
          ? col.sortValue(a)
          : (a as Record<string, unknown>)[sortKey];
        const bv = col?.sortValue
          ? col.sortValue(b)
          : (b as Record<string, unknown>)[sortKey];
        const an = typeof av === "number" ? av : String(av ?? "");
        const bn = typeof bv === "number" ? bv : String(bv ?? "");
        if (an < bn) return sortDir === "asc" ? -1 : 1;
        if (an > bn) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [rows, q, searchKeys, sortKey, sortDir, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  return (
    <div className="space-y-3">
      {searchKeys && (
        <input
          className="sf-input max-w-sm"
          placeholder="Search table…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
      )}
      <div className="sf-card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-wide text-[var(--sf-muted)]">
            <tr>
              {columns.map((c) => (
                <th key={String(c.key)} className={`px-3 py-2.5 font-semibold ${c.className || ""}`}>
                  <button
                    type="button"
                    className="hover:text-slate-800"
                    onClick={() => toggleSort(String(c.key))}
                  >
                    {c.label}
                    {sortKey === String(c.key) ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={(row.id as string) || i} className="border-t border-[var(--sf-border)] hover:bg-slate-50/80">
                {columns.map((c) => (
                  <td key={String(c.key)} className={`px-3 py-2.5 ${c.className || ""}`}>
                    {c.render
                      ? c.render(row)
                      : String((row as Record<string, unknown>)[c.key as string] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
            {!pageRows.length && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-[var(--sf-muted)]">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-[var(--sf-muted)]">
        <span>
          {filtered.length} row{filtered.length === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="sf-btn sf-btn-ghost px-2 py-1 text-xs disabled:opacity-40"
            disabled={page <= 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <span className="self-center">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="sf-btn sf-btn-ghost px-2 py-1 text-xs disabled:opacity-40"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
