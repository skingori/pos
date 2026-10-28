"use client";

import { useEffect, useState } from "react";
import { formatKes } from "@/lib/money";
import { useSession } from "next-auth/react";
import { canManageInventory } from "@/lib/permissions";
import { Role } from "@prisma/client";

type Supplier = { id: string; name: string };
type Product = { id: string; name: string; cost: number; unit: string; trackSerial?: boolean };
type Purchase = {
  id: string;
  status: string;
  totalCost: number;
  createdAt: string;
  supplier: { name: string } | null;
  user: { name: string };
  lines: { qty: number; unitCost: number; product: { name: string } }[];
};

export default function PurchasingPage() {
  const { data: session } = useSession();
  const canEdit = session?.user?.role && canManageInventory(session.user.role as Role);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [lines, setLines] = useState<
    { productId: string; name: string; qty: number; unitCost: number; trackSerial?: boolean; serials: string }[]
  >([]);
  const [error, setError] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [recalcSell, setRecalcSell] = useState(true);
  const [asOrder, setAsOrder] = useState(false);
  const [serials, setSerials] = useState("");

  async function load() {
    const [p, s, pr] = await Promise.all([
      fetch("/api/purchases").then((r) => r.json()),
      fetch("/api/suppliers").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
    ]);
    setPurchases(p);
    setSuppliers(s);
    setProducts(pr);
  }

  useEffect(() => {
    load();
  }, []);

  function addLine() {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const q = Number(qty) || 1;
    if (product.trackSerial) {
      const list = serials
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length !== q) {
        setError(`${product.name} needs ${q} serial(s)`);
        return;
      }
    }
    setLines((prev) => [
      ...prev,
      {
        productId: product.id,
        name: product.name,
        qty: q,
        unitCost: Number(unitCost) || product.cost,
        trackSerial: Boolean(product.trackSerial),
        serials,
      },
    ]);
    setProductId("");
    setQty("1");
    setUnitCost("");
    setSerials("");
    setError("");
  }

  async function receive() {
    setError("");
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: supplierId || null,
        recalculateSellFromMarkup: recalcSell,
        status: asOrder ? "ORDERED" : "RECEIVED",
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitCost: l.unitCost,
          serials: l.trackSerial ? l.serials : undefined,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setLines([]);
    load();
  }

  async function receiveOrder(id: string) {
    const res = await fetch("/api/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, recalculateSellFromMarkup: recalcSell }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Receive failed");
      return;
    }
    load();
  }

  async function createSupplier() {
    if (!newSupplier.trim()) return;
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSupplier }),
    });
    if (res.ok) {
      setNewSupplier("");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--sf-brand)]">Purchasing</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Received stock lands on the active branch (see top bar).
        </p>
      </div>
      {error && <p className="sf-alert sf-alert-error">{error}</p>}

      {canEdit && (
        <section className="sf-card p-5">
          <h2 className="font-medium">Receive stock</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              className="sf-select"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              className="sf-select"
              placeholder="New supplier name"
              value={newSupplier}
              onChange={(e) => setNewSupplier(e.target.value)}
            />
            <button type="button" className="sf-btn sf-btn-ghost" onClick={createSupplier}>
              Add supplier
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              className="sf-select min-w-[200px] flex-1"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                const p = products.find((x) => x.id === e.target.value);
                if (p) setUnitCost(String(p.cost));
              }}
            >
              <option value="">Product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              className="sf-input w-24"
              placeholder="Qty"
              inputMode="decimal"
              step="0.5"
              type="number"
              min="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <input
              className="sf-input w-28"
              placeholder="Buying price"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
            <button type="button" className="sf-btn sf-btn-ghost" onClick={addLine}>
              Add line
            </button>
          </div>
          {products.find((p) => p.id === productId)?.trackSerial && (
            <textarea
              className="sf-input mt-2"
              rows={2}
              placeholder="Serial numbers (one per line or comma-separated)"
              value={serials}
              onChange={(e) => setSerials(e.target.value)}
            />
          )}
          <ul className="mt-3 space-y-1 text-sm">
            {lines.map((l, i) => (
              <li key={i} className="flex justify-between border-b py-1">
                <span>
                  {l.name} ×{l.qty} @ {formatKes(l.unitCost)}
                  {l.trackSerial && l.serials ? (
                    <span className="ml-2 font-mono text-[11px] text-slate-500">
                      S/N {l.serials.replace(/\n/g, ", ")}
                    </span>
                  ) : null}
                </span>
                <button type="button" className="text-red-600" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={recalcSell}
              onChange={(e) => setRecalcSell(e.target.checked)}
            />
            Recalculate sell price from shop markup after receive
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={asOrder}
              onChange={(e) => setAsOrder(e.target.checked)}
            />
            Save as purchase order only (receive stock later)
          </label>
          <button
            type="button"
            disabled={!lines.length}
            onClick={receive}
            className="sf-btn sf-btn-primary mt-4 disabled:opacity-50"
          >
            {asOrder ? "Create order" : "Receive purchase"}
          </button>
        </section>
      )}

      <section className="sf-card p-5">
        <h2 className="font-medium">Recent purchases</h2>
        <div className="mt-3 space-y-3">
          {purchases.map((p) => (
            <div key={p.id} className="border-t pt-3 text-sm">
              <div className="flex justify-between font-medium">
                <span>
                  {p.supplier?.name || "No supplier"}{" "}
                  <span className="text-xs font-normal text-slate-500">({p.status})</span>
                </span>
                <span>{formatKes(p.totalCost)}</span>
              </div>
              <div className="text-slate-500">
                {new Date(p.createdAt).toLocaleString()} · {p.user.name}
                {p.status === "ORDERED" && canEdit && (
                  <button
                    type="button"
                    className="ml-2 text-blue-600 underline"
                    onClick={() => receiveOrder(p.id)}
                  >
                    Receive now
                  </button>
                )}
              </div>
              <ul className="mt-1 text-slate-600">
                {p.lines.map((l, i) => (
                  <li key={i}>
                    {l.product.name} ×{l.qty} @ {formatKes(l.unitCost)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
