"use client";

import { useEffect, useState } from "react";

type Promo = {
  id: string;
  name: string;
  percentOff: number;
  active: boolean;
  product: { name: string } | null;
};

type Product = { id: string; name: string };

export default function PromotionsPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({ name: "", percentOff: "10", productId: "" });
  const [error, setError] = useState("");

  async function load() {
    const [p, pr] = await Promise.all([
      fetch("/api/promotions").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
    ]);
    setPromos(p);
    setProducts(pr);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        percentOff: Number(form.percentOff),
        productId: form.productId || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setForm({ name: "", percentOff: "10", productId: "" });
    load();
  }

  async function deactivate(id: string) {
    await fetch("/api/promotions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: false }),
    });
    load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--sf-brand)]">Promotions</h1>
      <p className="text-sm text-slate-500">
        Percent-off deals applied automatically at checkout (storewide or per item).
      </p>
      {error && <p className="sf-alert sf-alert-error">{error}</p>}

      <form onSubmit={create} className="sf-card space-y-3 p-5">
        <input
          className="sf-input"
          placeholder="Promotion name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <div className="flex gap-2">
          <input
            className="sf-input w-28"
            placeholder="% off"
            value={form.percentOff}
            onChange={(e) => setForm({ ...form, percentOff: e.target.value })}
          />
          <select
            className="sf-input flex-1"
            value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="sf-btn sf-btn-primary">
          Create promotion
        </button>
      </form>

      <ul className="sf-card space-y-2 p-5 text-sm">
        {promos.map((p) => (
          <li key={p.id} className="flex justify-between border-t pt-2 first:border-0 first:pt-0">
            <span>
              {p.name} · {p.percentOff}% · {p.product?.name || "All items"}
            </span>
            {p.active && (
              <button type="button" className="text-red-600" onClick={() => deactivate(p.id)}>
                End
              </button>
            )}
          </li>
        ))}
        {!promos.length && <li className="text-slate-500">No active promotions</li>}
      </ul>
    </div>
  );
}
