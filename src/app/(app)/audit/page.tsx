"use client";

import { useEffect, useState } from "react";

type Log = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string | null;
  createdAt: string;
  user: { name: string } | null;
};

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/audit")
      .then(async (r) => {
        if (!r.ok) throw new Error("Forbidden");
        return r.json();
      })
      .then(setLogs)
      .catch(() => setError("You do not have access to audit logs"));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--sf-brand)]">Audit logs</h1>
      <p className="text-sm text-slate-500">Append-only record of sensitive actions.</p>
      <div className="sf-table-wrap">
        <table className="w-full text-sm">
          <thead className="sf-thead">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Who</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="sf-row">
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(l.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">{l.user?.name || "—"}</td>
                <td className="px-3 py-2">{l.action}</td>
                <td className="px-3 py-2">
                  {l.entity}
                  {l.entityId ? ` · ${l.entityId.slice(0, 8)}` : ""}
                </td>
                <td className="px-3 py-2 max-w-xs truncate">{l.detail || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
