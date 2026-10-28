"use client";

import { useEffect, useState } from "react";
import { formatKes } from "@/lib/money";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  balance: number;
  priceLevel?: { name: string; discountPercent: number } | null;
};

type PriceLevel = { id: string; name: string; discountPercent: number };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [levels, setLevels] = useState<PriceLevel[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    creditLimit: "0",
    priceLevelId: "",
  });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    const [c, l] = await Promise.all([
      fetch(`/api/customers${params}`).then((r) => r.json()),
      fetch("/api/price-levels").then((r) => r.json()),
    ]);
    setCustomers(c);
    setLevels(l);
  }

  useEffect(() => {
    load();
  }, [q]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        creditLimit: Number(form.creditLimit) || 0,
        priceLevelId: form.priceLevelId || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setShow(false);
    setForm({ name: "", phone: "", email: "", creditLimit: "0", priceLevelId: "" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--sf-brand)]">Customers</h1>
        <button
          type="button"
          onClick={() => setShow(true)}
          className="sf-btn sf-btn-primary"
        >
          Add customer
        </button>
      </div>
      <input
        className="sf-input max-w-md"
        placeholder="Search name or phone"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="sf-table-wrap">
        <table className="w-full text-sm">
          <thead className="sf-thead">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Price level</th>
              <th className="px-3 py-2">Credit limit</th>
              <th className="px-3 py-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="sf-row">
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2">{c.phone || "—"}</td>
                <td className="px-3 py-2">
                  {c.priceLevel
                    ? `${c.priceLevel.name} (-${c.priceLevel.discountPercent}%)`
                    : "Retail"}
                </td>
                <td className="px-3 py-2">{formatKes(c.creditLimit)}</td>
                <td className="px-3 py-2">{formatKes(c.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {show && (
        <div className="sf-modal-backdrop">
          <form onSubmit={save} className="sf-modal">
            <h2 className="text-lg font-semibold tracking-tight">Add customer</h2>
            {error && <p className="sf-alert sf-alert-error mt-2">{error}</p>}
            {(["name", "phone", "email", "creditLimit"] as const).map((key) => (
              <label key={key} className="mt-3 block text-sm capitalize">
                {key === "creditLimit" ? "Credit limit" : key}
                <input
                  className="sf-input mt-1"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  required={key === "name"}
                />
              </label>
            ))}
            <label className="mt-3 block text-sm">
              Price level
              <select
                className="sf-input mt-1"
                value={form.priceLevelId}
                onChange={(e) => setForm({ ...form, priceLevelId: e.target.value })}
              >
                <option value="">Default / Retail</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} (-{l.discountPercent}%)
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="sf-btn sf-btn-ghost" onClick={() => setShow(false)}>
                Cancel
              </button>
              <button type="submit" className="sf-btn sf-btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
