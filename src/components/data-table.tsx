"use client";

import { useMemo, useState } from "react";
import { toCsv } from "@/lib/csv";

export type DataTableColumn<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
  sortable?: boolean;
};

export function DataTable<T extends { id?: string }>({
  rows,
  columns,
  searchKeys,
  pageSize = 15,
  empty = "No rows",
  exportName,
  toolbar,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  searchKeys?: (keyof T)[];
  pageSize?: number;
  empty?: string;
  /** When set, shows Export CSV using this filename stem. */
  exportName?: string;
  toolbar?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);

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

  const pageCount = Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * size, safePage * size + size);
  const from = filtered.length ? safePage * size + 1 : 0;
  const to = Math.min((safePage + 1) * size, filtered.length);

  function toggleSort(key: string, sortable = true) {
    if (!sortable) return;
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  function exportCsv() {
    if (!exportName) return;
    const blob = new Blob(
      [
        toCsv(
          filtered.map((row) => {
            const out: Record<string, string | number> = {};
            for (const c of columns) {
              if (c.key === "actions") continue;
              const raw = c.sortValue
                ? c.sortValue(row)
                : (row as Record<string, unknown>)[c.key as string];
              out[c.label] =
                raw == null
                  ? ""
                  : typeof raw === "number"
                    ? raw
                    : String(raw);
            }
            return out;
          })
        ),
      ],
      { type: "text/csv;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {exportName && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
              disabled={!filtered.length}
              onClick={exportCsv}
            >
              Export CSV
            </button>
          )}
          {toolbar}
        </div>
        {searchKeys && (
          <input
            className="sf-input max-w-xs text-sm"
            placeholder="Filter rows…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-medium text-slate-500">
                {columns.map((c) => {
                  const sortable = c.sortable !== false;
                  const active = sortKey === String(c.key);
                  return (
                    <th
                      key={String(c.key)}
                      className={`px-4 py-3 font-medium ${c.className || ""}`}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-slate-800"
                          onClick={() => toggleSort(String(c.key), sortable)}
                        >
                          {c.label}
                          <span className="text-[10px] text-slate-400">
                            {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                          </span>
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr
                  key={(row.id as string) || i}
                  className={`border-b border-slate-50 hover:bg-slate-50/90 ${
                    i % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                  }`}
                >
                  {columns.map((c) => (
                    <td
                      key={String(c.key)}
                      className={`px-4 py-3 ${c.className || ""}`}
                    >
                      {c.render
                        ? c.render(row)
                        : String(
                            (row as Record<string, unknown>)[c.key as string] ?? "—"
                          )}
                    </td>
                  ))}
                </tr>
              ))}
              {!pageRows.length && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    {empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <span>
              Showing {from} to {to} of {filtered.length}
            </span>
            <label className="flex items-center gap-1.5 text-xs">
              Rows
              <select
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                value={size}
                onChange={(e) => {
                  setSize(Number(e.target.value));
                  setPage(0);
                }}
              >
                {[10, 15, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
              disabled={safePage <= 0}
              onClick={() => setPage(0)}
            >
              First
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <span className="self-center px-1 text-xs tabular-nums">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(pageCount - 1)}
            >
              Last
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
