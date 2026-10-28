"use client";

import { useEffect, useState } from "react";
import { formatKes } from "@/lib/money";

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
};

type Entry = {
  id: string;
  date: string;
  memo: string;
  sourceType: string;
  lines: {
    debit: number;
    credit: number;
    account: { code: string; name: string };
  }[];
};

export default function AccountingPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const data = await fetch(`/api/journals?${params}`).then((r) => r.json());
    setAccounts(data.accounts || []);
    setEntries(data.entries || []);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--sf-brand)]">Accounting</h1>
          <p className="text-sm text-[var(--sf-muted)]">Chart of accounts and auto journals</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            From
            <input
              type="date"
              className="sf-input mt-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-xs">
            To
            <input
              type="date"
              className="sf-input mt-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={load}
            className="sf-btn sf-btn-primary"
          >
            Refresh
          </button>
        </div>
      </div>

      <section>
        <h2 className="mb-2 font-medium">Chart of accounts</h2>
        <div className="sf-table-wrap">
          <table className="min-w-full text-left text-sm">
            <thead className="sf-thead">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="sf-row">
                  <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2 text-slate-500">{a.type}</td>
                  <td className="px-3 py-2 text-right">{formatKes(a.debit)}</td>
                  <td className="px-3 py-2 text-right">{formatKes(a.credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Journal entries</h2>
        <div className="space-y-3">
          {entries.length === 0 && (
            <p className="text-sm text-slate-500">No journals yet — sales and purchases will post here.</p>
          )}
          {entries.map((e) => (
            <div key={e.id} className="sf-card p-4">
              <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
                <div>
                  <span className="font-medium">{e.memo}</span>
                  <span className="ml-2 text-xs text-slate-500">{e.sourceType}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(e.date).toLocaleString()}
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {e.lines.map((l, i) => (
                    <tr key={i} className="sf-row">
                      <td className="py-1 font-mono text-xs text-slate-500">{l.account.code}</td>
                      <td className="py-1">{l.account.name}</td>
                      <td className="py-1 text-right">
                        {l.debit > 0 ? formatKes(l.debit) : ""}
                      </td>
                      <td className="py-1 text-right">
                        {l.credit > 0 ? formatKes(l.credit) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
