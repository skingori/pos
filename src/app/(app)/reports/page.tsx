"use client";

import { useEffect, useState } from "react";
import { formatKes } from "@/lib/money";
import { DataTable } from "@/components/data-table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Report = {
  from: string;
  to: string;
  salesTotal: number;
  taxTotal: number;
  discountTotal: number;
  costTotal: number;
  profit: number;
  refundTotal: number;
  transactions: number;
  byCashier: { name: string; sales: number; txns: number; profit: number }[];
  byPayment: { method: string; amount: number }[];
  byCustomer: { name: string; sales: number; txns: number }[];
  byCategory: { name: string; qty: number; revenue: number }[];
  dailySales: { date: string; sales: number; profit: number; txns: number }[];
  topItems: {
    name: string;
    sku: string;
    qty: number;
    revenue: number;
    cost: number;
    profit: number;
  }[];
  inventoryValue: number;
  retailValue: number;
  openedValue: number;
  lowStockCount: number;
  stockStatus: {
    id: string;
    name: string;
    sku: string;
    category: string;
    qty: number;
    openedQty: number;
    reorderLevel: number;
    cost: number;
    sellPrice: number;
    stockValue: number;
    retailValue: number;
    status: string;
  }[];
  receivables: {
    id: string;
    name: string;
    phone: string | null;
    balance: number;
    creditLimit: number;
  }[];
  receivablesTotal: number;
  salesTable: {
    id: string;
    receiptNo: number;
    date: string;
    cashier: string;
    customer: string;
    items: number;
    tax: number;
    total: number;
    profit: number;
    payments: string;
    status: string;
  }[];
  refunds: {
    id: string;
    receiptNo: number;
    amount: number;
    date: string;
    items: string;
  }[];
};

const TABS = [
  { id: "overview", label: "Sales overview" },
  { id: "items", label: "Sales by item" },
  { id: "customers", label: "Sales by customer" },
  { id: "employees", label: "By cashier" },
  { id: "inventory", label: "Inventory" },
  { id: "receivables", label: "Receivables" },
  { id: "tax", label: "Tax & refunds" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const PIE_COLORS = ["#0c2340", "#0f9f8f", "#3b82f6", "#d97706", "#e11d48", "#64748b"];

export default function ReportsPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Report | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    const params = new URLSearchParams({
      from: start.toISOString(),
      to: end.toISOString(),
    });
    const res = await fetch(`/api/reports/detailed?${params}`);
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function exportCsv(type: "sales" | "inventory" | "customers") {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    const params = new URLSearchParams({
      from: start.toISOString(),
      to: end.toISOString(),
      type,
      format: "csv",
    });
    window.open(`/api/reports/detailed?${params}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--sf-brand)]">Report center</h1>
          <p className="text-sm text-slate-500">
            QuickBooks-style sales, inventory, receivables, and tax views
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <label>
            From
            <input
              type="date"
              className="sf-input ml-1 w-auto"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              className="sf-input ml-1 w-auto"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="sf-btn sf-btn-primary disabled:opacity-60"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Loading…" : "Run"}
          </button>
          <button type="button" className="sf-btn sf-btn-ghost" onClick={() => exportCsv("sales")}>
            Sales CSV
          </button>
          <button
            type="button"
            className="sf-btn sf-btn-ghost"
            onClick={() => exportCsv("inventory")}
          >
            Inventory CSV
          </button>
          <button
            type="button"
            className="sf-btn sf-btn-ghost"
            onClick={() => exportCsv("customers")}
          >
            A/R CSV
          </button>
        </div>
      </div>

      <div className="sf-card flex flex-wrap gap-1 p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              tab === t.id
                ? "bg-gradient-to-b from-[var(--sf-brand-soft)] to-[var(--sf-brand)] text-white shadow-[0_8px_18px_-10px_rgb(12_35_64_/_70%)]"
                : "text-slate-600 hover:bg-slate-100/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="text-slate-500">Loading reports…</p>
      ) : (
        <>
          {tab === "overview" && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Sales", formatKes(data.salesTotal)],
                  ["Gross profit", formatKes(data.profit)],
                  ["VAT collected", formatKes(data.taxTotal)],
                  ["Transactions", String(data.transactions)],
                ].map(([label, value]) => (
                  <div key={label} className="sf-card sf-stat p-5">
                    <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
                    <div className="mt-2 text-xl font-semibold tracking-tight text-[var(--sf-brand)]">{value}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="sf-card p-5">
                  <h2 className="mb-3 font-medium">Daily sales trend</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.dailySales}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => formatKes(Number(v))} />
                        <Legend />
                        <Line type="monotone" dataKey="sales" stroke="#0c2340" strokeWidth={2.5} name="Sales" />
                        <Line type="monotone" dataKey="profit" stroke="#0f9f8f" strokeWidth={2.5} name="Profit" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="sf-card p-5">
                  <h2 className="mb-3 font-medium">Payments mix</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.byPayment}
                          dataKey="amount"
                          nameKey="method"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={({ method, percent }) =>
                            `${method} ${((percent || 0) * 100).toFixed(0)}%`
                          }
                        >
                          {data.byPayment.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatKes(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>

              <section className="sf-card p-5">
                <h2 className="mb-3 font-medium">Sales detail</h2>
                <DataTable
                  rows={data.salesTable}
                  searchKeys={["customer", "cashier", "receiptNo", "payments"]}
                  columns={[
                    {
                      key: "receiptNo",
                      label: "Receipt",
                      render: (r) => `#${r.receiptNo}`,
                      sortValue: (r) => r.receiptNo,
                    },
                    {
                      key: "date",
                      label: "Date",
                      render: (r) => new Date(r.date).toLocaleString(),
                      sortValue: (r) => r.date,
                    },
                    { key: "customer", label: "Customer" },
                    { key: "cashier", label: "Cashier" },
                    { key: "items", label: "Items", sortValue: (r) => r.items },
                    {
                      key: "total",
                      label: "Total",
                      render: (r) => formatKes(r.total),
                      sortValue: (r) => r.total,
                    },
                    {
                      key: "profit",
                      label: "Profit",
                      render: (r) => formatKes(r.profit),
                      sortValue: (r) => r.profit,
                    },
                    { key: "payments", label: "Pay" },
                    { key: "status", label: "Status" },
                  ]}
                />
              </section>
            </div>
          )}

          {tab === "items" && (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="sf-card p-5">
                  <h2 className="mb-3 font-medium">Top items by revenue</h2>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.topItems.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v) => formatKes(Number(v))} />
                        <Bar dataKey="revenue" fill="#2563eb" name="Revenue" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="sf-card p-5">
                  <h2 className="mb-3 font-medium">Sales by category</h2>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.byCategory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => formatKes(Number(v))} />
                        <Bar dataKey="revenue" fill="#0f2744" name="Revenue" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>
              <section className="sf-card p-5">
                <h2 className="mb-3 font-medium">Sales by item summary</h2>
                <DataTable
                  rows={data.topItems.map((i, idx) => ({ ...i, id: i.sku || String(idx) }))}
                  searchKeys={["name", "sku"]}
                  columns={[
                    { key: "name", label: "Item" },
                    { key: "sku", label: "SKU" },
                    { key: "qty", label: "Qty sold", sortValue: (r) => r.qty },
                    {
                      key: "revenue",
                      label: "Revenue",
                      render: (r) => formatKes(r.revenue),
                      sortValue: (r) => r.revenue,
                    },
                    {
                      key: "cost",
                      label: "COGS",
                      render: (r) => formatKes(r.cost),
                      sortValue: (r) => r.cost,
                    },
                    {
                      key: "profit",
                      label: "Profit",
                      render: (r) => formatKes(r.profit),
                      sortValue: (r) => r.profit,
                    },
                  ]}
                />
              </section>
            </div>
          )}

          {tab === "customers" && (
            <div className="space-y-6">
              <section className="sf-card p-5">
                <h2 className="mb-3 font-medium">Sales by customer</h2>
                <div className="mb-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byCustomer.slice(0, 12)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatKes(Number(v))} />
                      <Bar dataKey="sales" fill="#0f2744" name="Sales" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <DataTable
                  rows={data.byCustomer.map((c, i) => ({ ...c, id: String(i) }))}
                  searchKeys={["name"]}
                  columns={[
                    { key: "name", label: "Customer" },
                    { key: "txns", label: "Txns", sortValue: (r) => r.txns },
                    {
                      key: "sales",
                      label: "Sales",
                      render: (r) => formatKes(r.sales),
                      sortValue: (r) => r.sales,
                    },
                  ]}
                />
              </section>
            </div>
          )}

          {tab === "employees" && (
            <div className="space-y-6">
              <section className="sf-card p-5">
                <h2 className="mb-3 font-medium">Sales by cashier (rep)</h2>
                <div className="mb-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byCashier}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatKes(Number(v))} />
                      <Legend />
                      <Bar dataKey="sales" fill="#2563eb" name="Sales" />
                      <Bar dataKey="profit" fill="#16a34a" name="Profit" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <DataTable
                  rows={data.byCashier.map((c, i) => ({ ...c, id: String(i) }))}
                  columns={[
                    { key: "name", label: "Cashier" },
                    { key: "txns", label: "Transactions", sortValue: (r) => r.txns },
                    {
                      key: "sales",
                      label: "Sales",
                      render: (r) => formatKes(r.sales),
                      sortValue: (r) => r.sales,
                    },
                    {
                      key: "profit",
                      label: "Profit",
                      render: (r) => formatKes(r.profit),
                      sortValue: (r) => r.profit,
                    },
                  ]}
                />
              </section>
            </div>
          )}

          {tab === "inventory" && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Stock value (cost)", formatKes(data.inventoryValue)],
                  ["Retail value", formatKes(data.retailValue)],
                  ["Opened / quarantine", formatKes(data.openedValue)],
                ].map(([label, value]) => (
                  <div key={label} className="sf-card sf-stat p-5">
                    <div className="text-xs uppercase text-slate-500">{label}</div>
                    <div className="mt-2 text-xl font-semibold">{value}</div>
                  </div>
                ))}
              </div>
              {data.lowStockCount > 0 && (
                <p className="sf-alert sf-alert-warn">
                  {data.lowStockCount} item(s) at or below reorder / out of stock
                </p>
              )}
              <section className="sf-card p-5">
                <h2 className="mb-3 font-medium">Inventory stock status</h2>
                <DataTable
                  rows={data.stockStatus}
                  searchKeys={["name", "sku", "category", "status"]}
                  columns={[
                    { key: "name", label: "Item" },
                    { key: "sku", label: "SKU" },
                    { key: "category", label: "Category" },
                    { key: "qty", label: "On hand", sortValue: (r) => r.qty },
                    { key: "openedQty", label: "Opened", sortValue: (r) => r.openedQty },
                    { key: "reorderLevel", label: "Reorder", sortValue: (r) => r.reorderLevel },
                    {
                      key: "stockValue",
                      label: "Cost value",
                      render: (r) => formatKes(r.stockValue),
                      sortValue: (r) => r.stockValue,
                    },
                    {
                      key: "retailValue",
                      label: "Retail value",
                      render: (r) => formatKes(r.retailValue),
                      sortValue: (r) => r.retailValue,
                    },
                    {
                      key: "status",
                      label: "Status",
                      render: (r) => (
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            r.status === "OK"
                              ? "bg-green-100 text-green-800"
                              : r.status === "Out"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {r.status}
                        </span>
                      ),
                    },
                  ]}
                />
              </section>
            </div>
          )}

          {tab === "receivables" && (
            <div className="space-y-6">
              <div className="sf-card p-5">
                <div className="text-xs uppercase text-slate-500">Total receivables</div>
                <div className="mt-2 text-2xl font-semibold">{formatKes(data.receivablesTotal)}</div>
              </div>
              <section className="sf-card p-5">
                <h2 className="mb-3 font-medium">Customer balances (A/R)</h2>
                <div className="mb-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.receivables.slice(0, 12)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatKes(Number(v))} />
                      <Bar dataKey="balance" fill="#d97706" name="Balance" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <DataTable
                  rows={data.receivables}
                  searchKeys={["name", "phone"]}
                  columns={[
                    { key: "name", label: "Customer" },
                    { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
                    {
                      key: "balance",
                      label: "Balance",
                      render: (r) => formatKes(r.balance),
                      sortValue: (r) => r.balance,
                    },
                    {
                      key: "creditLimit",
                      label: "Limit",
                      render: (r) => formatKes(r.creditLimit),
                      sortValue: (r) => r.creditLimit,
                    },
                  ]}
                />
              </section>
            </div>
          )}

          {tab === "tax" && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["VAT / tax collected", formatKes(data.taxTotal)],
                  ["Discounts given", formatKes(data.discountTotal)],
                  ["Refunds approved", formatKes(data.refundTotal)],
                ].map(([label, value]) => (
                  <div key={label} className="sf-card sf-stat p-5">
                    <div className="text-xs uppercase text-slate-500">{label}</div>
                    <div className="mt-2 text-xl font-semibold">{value}</div>
                  </div>
                ))}
              </div>
              <section className="sf-card p-5">
                <h2 className="mb-3 font-medium">Approved refunds</h2>
                <DataTable
                  rows={data.refunds}
                  searchKeys={["items", "receiptNo"]}
                  columns={[
                    {
                      key: "receiptNo",
                      label: "Receipt",
                      render: (r) => `#${r.receiptNo}`,
                      sortValue: (r) => r.receiptNo,
                    },
                    {
                      key: "date",
                      label: "Date",
                      render: (r) => new Date(r.date).toLocaleString(),
                      sortValue: (r) => r.date,
                    },
                    { key: "items", label: "Items" },
                    {
                      key: "amount",
                      label: "Amount",
                      render: (r) => formatKes(r.amount),
                      sortValue: (r) => r.amount,
                    },
                  ]}
                  empty="No refunds in this period"
                />
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
