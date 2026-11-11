"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  downloadReportCsv,
  downloadReportExcel,
  downloadReportPdf,
} from "@/lib/report-export";
import { useFixedMenu } from "@/components/ui/use-fixed-menu";

type Log = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
};

type ExportFormat = "csv" | "excel" | "pdf";

const panel =
  "overflow-clip rounded-xl border border-[var(--sf-border)] bg-white shadow-sm";
const ghostBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sf-border)] bg-white px-2.5 text-xs font-medium text-[var(--sf-brand)] shadow-sm hover:bg-[var(--sf-surface-2)] disabled:opacity-50";
const primaryBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--sf-accent)] px-3 text-xs font-semibold text-white shadow-sm hover:bg-[var(--sf-accent-deep)] disabled:opacity-50";
const dateInput =
  "h-8 rounded-lg border-0 bg-white px-2.5 text-xs text-[var(--sf-brand)] ring-1 ring-inset ring-[var(--sf-border)] focus:ring-2 focus:ring-[var(--sf-accent)]";
const fieldInput =
  "h-8 w-full min-w-[10rem] rounded-lg border-0 bg-white px-2.5 text-xs text-[var(--sf-brand)] ring-1 ring-inset ring-[var(--sf-border)] placeholder:text-slate-400 focus:ring-2 focus:ring-[var(--sf-accent)]";

function isoDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function humanAction(action: string) {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionTone(action: string) {
  const a = action.toUpperCase();
  if (a.includes("VOID") || a.includes("DELETE") || a.includes("CANCEL"))
    return "bg-rose-50 text-rose-700 ring-rose-100";
  if (a.includes("REFUND")) return "bg-amber-50 text-amber-800 ring-amber-100";
  if (a.includes("SALE") || a.includes("MPESA") || a.includes("PAYMENT"))
    return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (a.includes("PURCHASE") || a.includes("RECEIVE") || a.includes("IMPORT"))
    return "bg-sky-50 text-sky-800 ring-sky-100";
  if (a.includes("OPEN") || a.includes("CLOSE") || a.includes("CASH"))
    return "bg-orange-50 text-orange-800 ring-orange-100";
  if (a.includes("UPDATE") || a.includes("SETTING") || a.includes("PASSWORD"))
    return "bg-violet-50 text-violet-800 ring-violet-100";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function prettyDetail(detail: string | null): { text: string; isJson: boolean } {
  if (!detail?.trim()) return { text: "—", isJson: false };
  try {
    const parsed = JSON.parse(detail);
    return { text: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { text: detail, isJson: false };
  }
}

function summarizeDetail(detail: string | null) {
  if (!detail?.trim()) return "—";
  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>;
    if (parsed.receiptNo != null) return `Receipt #${parsed.receiptNo}`;
    if (parsed.shopName != null) return `Shop · ${String(parsed.shopName)}`;
    if (parsed.name != null) return String(parsed.name);
    if (parsed.sku != null) return `SKU ${String(parsed.sku)}`;
    const keys = Object.keys(parsed).slice(0, 3);
    return keys.map((k) => `${k}: ${String(parsed[k])}`).join(" · ");
  } catch {
    return detail.length > 80 ? `${detail.slice(0, 80)}…` : detail;
  }
}

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDay(d);
  });
  const [to, setTo] = useState(() => isoDay());
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRootRef = useRef<HTMLDivElement>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportPos = useFixedMenu(exportOpen, exportTriggerRef, {
    minSpace: 140,
    maxMenu: 220,
  });

  function setRangePreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setFrom(isoDay(start));
    setTo(isoDay(end));
  }

  function activeRangeDays(): 1 | 7 | 30 | null {
    if (to !== isoDay()) return null;
    for (const days of [1, 7, 30] as const) {
      const start = new Date();
      start.setDate(start.getDate() - (days - 1));
      if (from === isoDay(start)) return days;
    }
    return null;
  }

  const rangeDays = activeRangeDays();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ from, to });
      try {
        const res = await fetch(`/api/audit?${params}`);
        if (!res.ok) throw new Error("Forbidden");
        const json = await res.json();
        if (!cancelled) {
          setLogs(json);
          setError("");
        }
      } catch {
        if (!cancelled) setError("You do not have access to audit logs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [from, to]);

  useEffect(() => {
    if (!exportOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (exportRootRef.current?.contains(t) || exportMenuRef.current?.contains(t)) return;
      setExportOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExportOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  const actions = useMemo(() => {
    const set = new Set(logs.map((l) => l.action));
    return [...set].sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (!term) return true;
      return (
        l.action.toLowerCase().includes(term) ||
        l.entity.toLowerCase().includes(term) ||
        (l.entityId || "").toLowerCase().includes(term) ||
        (l.detail || "").toLowerCase().includes(term) ||
        (l.user?.name || "").toLowerCase().includes(term)
      );
    });
  }, [logs, q, actionFilter]);

  useEffect(() => {
    setPage(1);
    setExpanded(null);
  }, [from, to, q, actionFilter, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(safePage * pageSize, filtered.length);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const actors = useMemo(() => {
    const set = new Set(filtered.map((l) => l.user?.name || "System"));
    return set.size;
  }, [filtered]);

  const topAction = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of filtered) counts[l.action] = (counts[l.action] || 0) + 1;
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? { action: best[0], count: best[1] } : null;
  }, [filtered]);

  function exportLogs(format: ExportFormat) {
    const rows = filtered.map((l) => ({
      when: l.createdAt,
      who: l.user?.name || "System",
      action: l.action,
      entity: l.entity,
      entityId: l.entityId || "",
      detail: l.detail || "",
    }));
    const stamp = `${from}_to_${to}`;
    const title = "Audit logs";
    const subtitle = `${from} → ${to} · ${filtered.length} events`;
    if (format === "csv") downloadReportCsv(rows, `audit-${stamp}.csv`);
    else if (format === "excel") downloadReportExcel(rows, `audit-${stamp}.xls`, title);
    else downloadReportPdf(title, subtitle, rows, `audit-${stamp}.pdf`);
    setExportOpen(false);
  }

  if (error) {
    return (
      <div className={`${panel} px-5 py-8 text-center`}>
        <p className="text-sm font-semibold text-rose-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className={panel} aria-label="Audit logs header">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <h1 className="sf-display truncate text-lg font-extrabold tracking-tight text-[var(--sf-brand)] sm:text-xl">
              Audit logs
            </h1>
            <p className="mt-0.5 text-xs text-[var(--sf-muted)]">
              Append-only trail of sales, stock, cash, and settings changes
              {loading ? " · Updating…" : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
                Range
              </p>
              <div
                role="group"
                aria-label="Quick date range"
                className="mt-1 inline-flex h-8 items-stretch rounded-lg border border-slate-200/70 bg-slate-100 p-0.5"
              >
                {(
                  [
                    { label: "Today", days: 1 as const },
                    { label: "7 days", days: 7 as const },
                    { label: "30 days", days: 30 as const },
                  ] as const
                ).map((p) => {
                  const on = rangeDays === p.days;
                  return (
                    <button
                      key={p.days}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setRangePreset(p.days)}
                      className={`rounded-md px-2.5 text-[11px] font-semibold transition ${
                        on
                          ? "bg-white text-[var(--sf-brand)] shadow-sm"
                          : "text-slate-600 hover:text-[var(--sf-brand)]"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
              From
              <input
                type="date"
                className={`${dateInput} mt-1 block`}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
              To
              <input
                type="date"
                className={`${dateInput} mt-1 block`}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>

            <div ref={exportRootRef}>
              <button
                ref={exportTriggerRef}
                type="button"
                className={primaryBtn}
                disabled={loading || !filtered.length}
                aria-expanded={exportOpen}
                aria-haspopup="menu"
                onClick={() => setExportOpen((o) => !o)}
              >
                Export
                <svg className="size-3.5 opacity-90" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {exportOpen &&
                exportPos &&
                typeof document !== "undefined" &&
                createPortal(
                  <div
                    ref={exportMenuRef}
                    role="menu"
                    className="fixed z-[70] min-w-[11rem] overflow-hidden rounded-xl border border-[var(--sf-border)] bg-white py-1 shadow-lg ring-1 ring-black/5"
                    style={{
                      left: Math.max(8, exportPos.left + exportPos.width - 176),
                      width: 176,
                      maxHeight: exportPos.maxHeight,
                      top: exportPos.place === "below" ? exportPos.top : undefined,
                      bottom:
                        exportPos.place === "above"
                          ? window.innerHeight - exportPos.top
                          : undefined,
                    }}
                  >
                    {(
                      [
                        { id: "csv" as const, label: "CSV (.csv)" },
                        { id: "excel" as const, label: "Excel (.xls)" },
                        { id: "pdf" as const, label: "PDF (.pdf)" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3 py-2 text-left text-xs font-medium text-[var(--sf-brand)] hover:bg-[var(--sf-surface-2)]"
                        onClick={() => exportLogs(opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-slate-100 sm:grid-cols-4">
          {[
            { label: "Events", value: String(filtered.length), note: "In current filters" },
            { label: "People", value: String(actors), note: "Distinct actors" },
            {
              label: "Top action",
              value: topAction ? humanAction(topAction.action) : "—",
              note: topAction ? `${topAction.count} times` : "No events",
            },
            {
              label: "Window",
              value: `${from.slice(5)} → ${to.slice(5)}`,
              note: loading ? "Loading…" : "Date range",
            },
          ].map((m) => (
            <div
              key={m.label}
              className="relative min-w-0 border-b border-r border-slate-100 px-4 py-3 last:border-r-0 sm:border-b-0"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[var(--sf-brand)]/80 to-transparent" />
              <p className="pl-2 text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                {m.label}
              </p>
              <p className="mt-1 truncate pl-2 font-mono text-base font-extrabold tabular-nums text-[var(--sf-brand)]">
                {m.value}
              </p>
              <p className="mt-0.5 truncate pl-2 text-[10px] text-[var(--sf-muted)]">{m.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={panel}>
        <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <label className="min-w-[12rem] flex-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
            Search
            <input
              className={`${fieldInput} mt-1`}
              placeholder="User, action, entity, receipt…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
            Action
            <select
              className={`${fieldInput} mt-1 min-w-[10rem]`}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="all">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {humanAction(a)}
                </option>
              ))}
            </select>
          </label>
          {(q || actionFilter !== "all") && (
            <button
              type="button"
              className={ghostBtn}
              onClick={() => {
                setQ("");
                setActionFilter("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-[var(--sf-surface-2)]/80 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Detail</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {paged.map((l, i) => {
                const open = expanded === l.id;
                const detail = prettyDetail(l.detail);
                return (
                  <Fragment key={l.id}>
                    <tr
                      className={`border-b border-slate-50 text-[var(--sf-brand)] hover:bg-[var(--sf-surface-2)]/70 ${
                        i % 2 === 1 ? "bg-[var(--sf-surface-2)]/35" : "bg-white"
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--sf-muted)]">
                        {formatWhen(l.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold">{l.user?.name || "System"}</p>
                        {l.user?.email ? (
                          <p className="text-[10px] text-[var(--sf-muted)]">{l.user.email}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${actionTone(l.action)}`}
                        >
                          {humanAction(l.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="font-medium">{l.entity}</span>
                        {l.entityId ? (
                          <span className="ml-1 font-mono text-[10px] text-[var(--sf-muted)]">
                            {l.entityId.slice(0, 10)}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[18rem] truncate px-4 py-3 text-xs text-[var(--sf-muted)]">
                        {summarizeDetail(l.detail)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          title={open ? "Hide detail" : "View detail"}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => setExpanded(open ? null : l.id)}
                        >
                          <svg
                            className="size-3.5 shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden
                          >
                            {open ? (
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            ) : (
                              <>
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                              </>
                            )}
                          </svg>
                          {open ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-b border-slate-100 bg-slate-50/80">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="rounded-lg border border-[var(--sf-border)] bg-white p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                              Full detail
                            </p>
                            <pre
                              className={`mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-[var(--sf-brand)] ${
                                detail.isJson ? "font-mono" : ""
                              }`}
                            >
                              {detail.text}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!filtered.length && !loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-16 text-center text-sm text-[var(--sf-muted)]"
                  >
                    No audit events in this range
                  </td>
                </tr>
              ) : null}
              {loading && !logs.length ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-16 text-center text-sm text-[var(--sf-muted)]"
                  >
                    Loading audit trail…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--sf-border)] px-4 py-3 text-sm text-[var(--sf-muted)] sm:px-5">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {filtered.length
                ? `Showing ${pageStart} – ${pageEnd} of ${filtered.length}`
                : "Showing 0 of 0"}
            </span>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="sr-only">Rows per page</span>
              <select
                className="h-8 rounded-lg border border-[var(--sf-border)] bg-white px-2.5 text-xs font-medium text-[var(--sf-brand)] outline-none focus:border-[var(--sf-accent)] focus:ring-1 focus:ring-[var(--sf-accent)]"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Rows per page"
              >
                <option value={10}>10 / page</option>
                <option value={24}>24 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={ghostBtn}
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={ghostBtn}
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
