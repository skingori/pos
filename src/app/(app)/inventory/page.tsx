"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatKes, marginPercent, suggestedSellPrice } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import { useSession } from "next-auth/react";
import { canManageInventory } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sellPrice: number;
  cost: number;
  qty: number;
  openedQty: number;
  reorderLevel: number;
  unit: string;
  imageUrl?: string | null;
  trackSerial?: boolean;
  isReturnSku?: boolean;
  branchId?: string;
  category: { id: string; name: string } | null;
  categoryId: string | null;
  returnSkus?: { id: string; sku: string; qty: number; sellPrice: number }[];
  parentProduct?: { id: string; sku: string; name: string } | null;
};

type Category = { id: string; name: string };
type Tab = "products" | "returns" | "categories";
type StatusFilter = "all" | "in_stock" | "low" | "out";
type ColKey =
  | "photo"
  | "sku"
  | "barcode"
  | "category"
  | "cost"
  | "sell"
  | "margin"
  | "qty"
  | "returns"
  | "reorder"
  | "cog"
  | "alert";

const UNITS = [
  { value: "pc", label: "Piece (pcs)" },
  { value: "kg", label: "Kilogram (kg) — halves OK" },
  { value: "g", label: "Gram (g)" },
  { value: "l", label: "Litre (L) — halves OK" },
  { value: "m", label: "Metre (m) — halves OK" },
  { value: "bag", label: "Bag — halves OK" },
  { value: "set", label: "Set" },
  { value: "box", label: "Box" },
];

const COLUMN_OPTIONS: { key: ColKey; label: string; defaultOn: boolean }[] = [
  { key: "photo", label: "Photo", defaultOn: true },
  { key: "sku", label: "SKU", defaultOn: true },
  { key: "barcode", label: "Barcode", defaultOn: false },
  { key: "category", label: "Category", defaultOn: true },
  { key: "cost", label: "Cost", defaultOn: false },
  { key: "sell", label: "Sell", defaultOn: true },
  { key: "margin", label: "Margin", defaultOn: false },
  { key: "qty", label: "Quantity", defaultOn: true },
  { key: "reorder", label: "Reorder level", defaultOn: false },
  { key: "returns", label: "Returns", defaultOn: false },
  { key: "cog", label: "Stock value", defaultOn: false },
  { key: "alert", label: "Alert", defaultOn: true },
];

const emptyForm = {
  name: "",
  sku: "",
  barcode: "",
  categoryId: "",
  cost: "0",
  sellPrice: "0",
  qty: "0",
  reorderLevel: "10",
  unit: "pc",
  markup: "25",
  trackSerial: false,
  imageUrl: "" as string,
};

function makeSku(name: string) {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16);
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `${base || "SKU"}-${suffix}`;
}

const CSV_TEMPLATE =
  "name,sku,barcode,category,cost,sell_price,qty,reorder_level,unit,track_serial\n" +
  "Hammer 16oz,HM-16,6001001001003,Tools,450,750,12,5,pc,true\n" +
  "Nail 3 inch (1kg),NL-300,6001001001001,Fasteners,180,250,40,10,kg,false\n";

function defaultColumns(): Record<ColKey, boolean> {
  return Object.fromEntries(
    COLUMN_OPTIONS.map((c) => [c.key, c.defaultOn])
  ) as Record<ColKey, boolean>;
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const canEdit = session?.user?.role && canManageInventory(session.user.role as Role);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branchName, setBranchName] = useState("branch");
  const [defaultMarkup, setDefaultMarkup] = useState(25);
  const [tab, setTab] = useState<Tab>("products");
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState(defaultColumns);
  const [showColumns, setShowColumns] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qtyEditId, setQtyEditId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState("");
  const [qtySaving, setQtySaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [p, c, s, b] = await Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/branches/active").then((r) => r.json()),
    ]);
    setProducts(Array.isArray(p) ? p : []);
    setCategories(Array.isArray(c) ? c : []);
    if (b?.name) setBranchName(b.name);
    if (s?.defaultMarkupPercent != null) {
      setDefaultMarkup(Number(s.defaultMarkupPercent));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!columnsRef.current?.contains(e.target as Node)) {
        setShowColumns(false);
      }
    }
    if (showColumns) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showColumns]);

  useEffect(() => {
    setPage(1);
  }, [q, categoryId, status, pageSize, tab]);

  const sellable = useMemo(
    () => products.filter((p) => !p.isReturnSku),
    [products]
  );
  const returnSkus = useMemo(
    () => products.filter((p) => p.isReturnSku),
    [products]
  );

  const stats = useMemo(() => {
    const stockValue = sellable.reduce((s, p) => s + p.cost * p.qty, 0);
    const below = sellable.filter((p) => p.qty <= p.reorderLevel).length;
    const uncategorized = sellable.filter((p) => !p.categoryId).length;
    const noBarcode = sellable.filter((p) => !p.barcode).length;
    return {
      stockValue,
      count: sellable.length,
      below,
      uncategorized,
      noBarcode,
      needsOrganize: uncategorized + noBarcode,
    };
  }, [sellable]);

  const filteredProducts = useMemo(() => {
    const term = q.trim().toLowerCase();
    return sellable.filter((p) => {
      if (categoryId && p.categoryId !== categoryId) return false;
      if (status === "low" && p.qty > p.reorderLevel) return false;
      if (status === "out" && p.qty > 0) return false;
      if (status === "in_stock" && p.qty <= 0) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.barcode || "").toLowerCase().includes(term)
      );
    });
  }, [sellable, q, categoryId, status]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = filteredProducts.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(safePage * pageSize, filteredProducts.length);
  const pagedProducts = filteredProducts.slice((safePage - 1) * pageSize, safePage * pageSize);

  const filteredReturns = useMemo(() => {
    const term = q.trim().toLowerCase();
    return returnSkus.filter((p) => {
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.parentProduct?.name || "").toLowerCase().includes(term)
      );
    });
  }, [returnSkus, q]);

  const categoryRows = useMemo(() => {
    return categories.map((c) => ({
      ...c,
      productCount: sellable.filter((p) => p.categoryId === c.id).length,
    }));
  }, [categories, sellable]);

  const suggested = useMemo(() => {
    const cost = Number(form.cost) || 0;
    const markup = Number(form.markup) || 0;
    return suggestedSellPrice(cost, markup);
  }, [form.cost, form.markup]);

  const previewMargin = useMemo(() => {
    return marginPercent(Number(form.cost) || 0, Number(form.sellPrice) || 0);
  }, [form.cost, form.sellPrice]);

  function col(key: ColKey) {
    return columns[key];
  }

  const visibleColCount =
    1 +
    COLUMN_OPTIONS.filter((c) => columns[c.key]).length +
    (canEdit ? 1 : 0);

  function clearImageSelection() {
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function onPickImage(file: File | null) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use a JPG, PNG, or WebP image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be 2 MB or smaller");
      return;
    }
    setError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, markup: String(defaultMarkup) });
    clearImageSelection();
    setShowMore(false);
    setError("");
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || "",
      categoryId: p.categoryId || "",
      cost: String(p.cost),
      sellPrice: String(p.sellPrice),
      qty: String(p.qty),
      reorderLevel: String(p.reorderLevel),
      unit: p.unit,
      markup: String(defaultMarkup),
      trackSerial: Boolean(p.trackSerial),
      imageUrl: p.imageUrl || "",
    });
    clearImageSelection();
    setShowMore(true);
    setError("");
    setShowForm(true);
  }

  async function uploadImageIfNeeded(): Promise<string | null | undefined> {
    if (imageFile) {
      const fd = new FormData();
      fd.append("file", imageFile);
      const res = await fetch("/api/products/image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image upload failed");
      return data.url as string;
    }
    if (!form.imageUrl) return null;
    return form.imageUrl;
  }

  async function saveProduct(addAnother: boolean) {
    setError("");
    if (!form.name.trim()) {
      setError("Product name is required");
      return;
    }
    if (form.cost === "" || Number(form.cost) < 0) {
      setError("Cost price is required");
      return;
    }
    if (!Number.isFinite(Number(form.sellPrice)) || Number(form.sellPrice) <= 0) {
      setError("Sell price must be greater than 0");
      return;
    }

    setSaving(true);
    try {
      const imageUrl = await uploadImageIfNeeded();
      const sku = form.sku.trim() || (editing ? editing.sku : makeSku(form.name));
      const payload = {
        name: form.name.trim(),
        sku,
        barcode: form.barcode || null,
        categoryId: form.categoryId || null,
        cost: Number(form.cost),
        sellPrice: Number(form.sellPrice),
        qty: Number(form.qty) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        unit: form.unit || "pc",
        trackSerial: form.trackSerial,
        imageUrl: imageUrl ?? null,
      };

      const res = await fetch(editing ? `/api/products/${editing.id}` : "/api/products", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Save failed");
        return;
      }

      await load();
      if (addAnother && !editing) {
        setForm({ ...emptyForm, markup: String(defaultMarkup) });
        clearImageSelection();
        setShowMore(false);
        setError("");
        return;
      }
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Deactivate this product?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    load();
  }

  function startQtyEdit(p: Product) {
    if (!canEdit) return;
    setQtyEditId(p.id);
    setQtyDraft(String(p.qty));
  }

  async function confirmQtyEdit(p: Product) {
    const next = Number(qtyDraft);
    if (!Number.isFinite(next) || next < 0) {
      alert("Quantity must be 0 or more");
      return;
    }
    if (next === p.qty) {
      setQtyEditId(null);
      return;
    }
    setQtySaving(true);
    const res = await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qty: next }),
    });
    setQtySaving(false);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Could not update quantity");
      return;
    }
    setQtyEditId(null);
    load();
  }

  async function quarantineAction(p: Product, action: "releaseOpened" | "writeOffOpened") {
    const max = Math.max(
      p.returnSkus?.reduce((s, r) => s + r.qty, 0) || 0,
      p.openedQty || 0
    );
    if (max <= 0) return;
    const raw = prompt(
      action === "releaseOpened"
        ? `Move how many from return SKU to sellable? (max ${max})`
        : `Write off how many from return SKU? (max ${max})`,
      String(max)
    );
    if (!raw) return;
    const qty = Number(raw);
    const res = await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, qty }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed");
      return;
    }
    load();
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const rows = filteredProducts.map((p) => ({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || "",
      category: p.category?.name || "",
      cost: p.cost,
      sell_price: p.sellPrice,
      qty: p.qty,
      reorder_level: p.reorderLevel,
      unit: p.unit,
      track_serial: p.trackSerial ? "true" : "false",
      opened_qty: p.openedQty,
    }));
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(file: File | null) {
    if (!file) return;
    setImportMsg("");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/products/import", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      setImportMsg(data.error || "Import failed");
      return;
    }
    setImportMsg(
      `Imported: ${data.created} created, ${data.updated} updated` +
        (data.errorCount ? ` - ${data.errorCount} row error(s)` : "")
    );
    load();
    if (fileRef.current) fileRef.current.value = "";
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategory.trim() }),
    });
    if (res.ok) {
      setNewCategory("");
      load();
    }
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "products", label: "Products", count: sellable.length },
    { id: "returns", label: "Return SKUs", count: returnSkus.length },
    { id: "categories", label: "Categories", count: categories.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        description={`Stock at ${branchName} - capture products, categories, and return SKUs`}
        actions={
          canEdit ? (
            <button type="button" onClick={openCreate} className="sf-btn sf-btn-primary">
              + Add product
            </button>
          ) : undefined
        }
      />

      {canEdit && (
        <div className="sf-card border-teal-200/80 bg-gradient-to-br from-teal-50/90 to-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[var(--sf-brand)]">Import from CSV</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Add many products at once. Download the template, fill it in, then upload. Quantity =
                count (pcs), weight (kg, g), or volume (L, m). Add categories later in the Categories
                tab.
              </p>
              {importMsg && <p className="mt-2 text-sm text-teal-800">{importMsg}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="sf-btn sf-btn-ghost" onClick={downloadTemplate}>
                Download CSV template
              </button>
              <button
                type="button"
                className="sf-btn sf-btn-accent"
                onClick={() => fileRef.current?.click()}
              >
                Choose CSV file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onImportFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sf-card sf-stat p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Total stock value
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--sf-brand)]">
            {formatKes(stats.stockValue)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Current cost of all items</p>
        </div>
        <div className="sf-card sf-stat p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Products in inventory
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--sf-brand)]">
            {stats.count}
          </div>
          <p className="mt-1 text-xs text-slate-500">Total distinct products</p>
        </div>
        <button
          type="button"
          className="sf-card sf-stat p-4 text-left transition hover:ring-1 hover:ring-slate-300"
          onClick={() => {
            setTab("products");
            setStatus("low");
          }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Below reorder
          </div>
          <div
            className={`mt-2 text-2xl font-semibold tracking-tight ${
              stats.below > 0 ? "text-rose-600" : "text-[var(--sf-brand)]"
            }`}
          >
            {stats.below}
          </div>
          <p className="mt-1 text-xs text-slate-500">Items that need restocking soon</p>
        </button>
      </div>

      {stats.needsOrganize > 0 && (
        <div className="sf-alert sf-alert-warn flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong>
              {stats.needsOrganize} product{stats.needsOrganize === 1 ? "" : "s"} need organizing
            </strong>
            <p className="mt-0.5 text-sm">
              Capture products quickly first. Later, use categories to make reports cleaner.{" "}
              {stats.uncategorized} uncategorized - {stats.noBarcode} without barcode
            </p>
          </div>
          <button
            type="button"
            className="sf-btn sf-btn-ghost bg-white/80"
            onClick={() => {
              setTab("products");
              setCategoryId("");
              setStatus("all");
              setQ("");
            }}
          >
            Organize now
          </button>
        </div>
      )}

      <div className="sf-card overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/80 p-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-2 text-sm transition ${
                tab === t.id
                  ? "bg-white font-semibold text-[var(--sf-brand)] shadow-sm ring-1 ring-slate-200"
                  : "text-slate-600 hover:bg-white/70"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-slate-400">{t.count}</span>
            </button>
          ))}
        </div>

        {tab === "products" && (
          <div className="border-b border-slate-100 px-4 pt-4">
            <h3 className="text-base font-semibold text-[var(--sf-brand)]">Products</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Your inventory list. Sort, filter, and manage products. Add categories in their tab
              first.
            </p>
          </div>
        )}

        {tab !== "categories" && (
          <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-3 py-3">
            {tab === "products" && (
              <>
                <label className="text-xs font-medium text-slate-500">
                  Category
                  <select
                    className="sf-select mt-1 w-auto min-w-[140px]"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">All</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Status
                  <select
                    className="sf-select mt-1 w-auto min-w-[130px]"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as StatusFilter)}
                  >
                    <option value="all">All</option>
                    <option value="in_stock">In stock</option>
                    <option value="low">Below reorder</option>
                    <option value="out">Out of stock</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Show
                  <select
                    className="sf-select mt-1 w-auto min-w-[72px]"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
              </>
            )}
            <label className="min-w-[200px] flex-1 text-xs font-medium text-slate-500">
              Search
              <input
                className="sf-input mt-1"
                placeholder={
                  tab === "returns"
                    ? "Search return SKU or parent product"
                    : "Name, SKU, or barcode"
                }
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            {tab === "products" && (
              <>
                <button
                  type="button"
                  className={`sf-btn ${
                    status === "low" ? "sf-btn-accent" : "sf-btn-ghost"
                  }`}
                  onClick={() => setStatus(status === "low" ? "all" : "low")}
                >
                  Below reorder only
                </button>
                <button type="button" className="sf-btn sf-btn-ghost" onClick={exportCsv}>
                  Export CSV
                </button>
                <div className="relative" ref={columnsRef}>
                  <button
                    type="button"
                    className="sf-btn sf-btn-ghost"
                    onClick={() => setShowColumns((v) => !v)}
                    aria-expanded={showColumns}
                  >
                    Columns
                  </button>
                  {showColumns && (
                    <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                      {COLUMN_OPTIONS.map((c) => (
                        <label
                          key={c.key}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={columns[c.key]}
                            onChange={() =>
                              setColumns((prev) => ({ ...prev, [c.key]: !prev[c.key] }))
                            }
                          />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Loading inventory...</p>
        ) : tab === "products" ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sf-thead">
                  <tr>
                    {col("photo") && <th className="px-3 py-2.5 w-14">Photo</th>}
                    <th className="px-3 py-2.5">Name</th>
                    {col("sku") && <th className="px-3 py-2.5">SKU</th>}
                    {col("barcode") && <th className="px-3 py-2.5">Barcode</th>}
                    {col("category") && <th className="px-3 py-2.5">Category</th>}
                    {col("cost") && <th className="px-3 py-2.5">Cost (KSh)</th>}
                    {col("sell") && <th className="px-3 py-2.5">Sell (KSh)</th>}
                    {col("margin") && <th className="px-3 py-2.5">Margin</th>}
                    {col("qty") && <th className="px-3 py-2.5">Qty</th>}
                    {col("reorder") && <th className="px-3 py-2.5">Reorder</th>}
                    {col("returns") && <th className="px-3 py-2.5">Returns</th>}
                    {col("cog") && <th className="px-3 py-2.5">Stock value</th>}
                    {col("alert") && <th className="px-3 py-2.5">Alert</th>}
                    {canEdit && <th className="px-3 py-2.5">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {pagedProducts.map((p) => {
                    const low = p.qty <= p.reorderLevel;
                    const out = p.qty <= 0;
                    const margin = marginPercent(p.cost, p.sellPrice);
                    const returnQty =
                      p.returnSkus?.reduce((s, r) => s + r.qty, 0) || p.openedQty || 0;
                    return (
                      <tr key={p.id} className="sf-row">
                        {col("photo") && (
                          <td className="px-3 py-2.5">
                            {p.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.imageUrl}
                                alt=""
                                className="h-10 w-10 rounded-lg object-cover ring-1 ring-slate-200"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                                -
                              </div>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-[var(--sf-brand)]">{p.name}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {p.trackSerial && (
                              <span className="sf-badge bg-slate-100 text-slate-600">Serial</span>
                            )}
                            {!p.barcode && (
                              <span className="sf-badge bg-amber-50 text-amber-800">No barcode</span>
                            )}
                          </div>
                        </td>
                        {col("sku") && (
                          <td className="px-3 py-2.5 font-mono text-xs">{p.sku}</td>
                        )}
                        {col("barcode") && (
                          <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                            {p.barcode || "-"}
                          </td>
                        )}
                        {col("category") && (
                          <td className="px-3 py-2.5 text-slate-600">
                            {p.category?.name || (
                              <span className="text-amber-700">Uncategorized</span>
                            )}
                          </td>
                        )}
                        {col("cost") && (
                          <td className="px-3 py-2.5 tabular-nums">{formatKes(p.cost)}</td>
                        )}
                        {col("sell") && (
                          <td className="px-3 py-2.5 tabular-nums">
                            {formatKes(p.sellPrice)}
                            <span className="text-slate-400">/{p.unit}</span>
                          </td>
                        )}
                        {col("margin") && (
                          <td className="px-3 py-2.5 tabular-nums">{margin.toFixed(1)}%</td>
                        )}
                        {col("qty") && (
                          <td className="px-3 py-2.5">
                            {qtyEditId === p.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="sf-input w-20 px-2 py-1"
                                  value={qtyDraft}
                                  autoFocus
                                  disabled={qtySaving}
                                  onChange={(e) => setQtyDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") confirmQtyEdit(p);
                                    if (e.key === "Escape") setQtyEditId(null);
                                  }}
                                />
                                <button
                                  type="button"
                                  className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
                                  disabled={qtySaving}
                                  onClick={() => confirmQtyEdit(p)}
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  className="rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700"
                                  disabled={qtySaving}
                                  onClick={() => setQtyEditId(null)}
                                >
                                  x
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={`tabular-nums font-medium ${
                                  canEdit
                                    ? "rounded-md px-1.5 py-0.5 hover:bg-slate-100 hover:ring-1 hover:ring-slate-200"
                                    : ""
                                }`}
                                onClick={() => startQtyEdit(p)}
                                title={canEdit ? "Click to adjust stock" : undefined}
                                disabled={!canEdit}
                              >
                                {p.qty} {p.unit}
                              </button>
                            )}
                          </td>
                        )}
                        {col("reorder") && (
                          <td className="px-3 py-2.5 tabular-nums text-slate-600">
                            {p.reorderLevel}
                          </td>
                        )}
                        {col("returns") && (
                          <td className="px-3 py-2.5">
                            {returnQty > 0 ? (
                              <span className="sf-badge bg-amber-100 text-amber-900">
                                {returnQty} {p.unit}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        )}
                        {col("cog") && (
                          <td className="px-3 py-2.5 tabular-nums">
                            {formatKes(p.cost * p.qty)}
                          </td>
                        )}
                        {col("alert") && (
                          <td className="px-3 py-2.5">
                            <span
                              className={`sf-badge ${
                                out
                                  ? "bg-rose-100 text-rose-800"
                                  : low
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {out ? "Out of stock" : low ? "Low stock" : "In stock"}
                            </span>
                          </td>
                        )}
                        {canEdit && (
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href="/pos"
                                className="sf-link text-xs"
                                title="Sell on POS"
                              >
                                Sell
                              </Link>
                              <button
                                type="button"
                                className="sf-link text-xs"
                                onClick={() => openEdit(p)}
                              >
                                Edit
                              </button>
                              {returnQty > 0 && (
                                <>
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-teal-700 hover:underline"
                                    onClick={() => quarantineAction(p, "releaseOpened")}
                                  >
                                    Release
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-amber-700 hover:underline"
                                    onClick={() => quarantineAction(p, "writeOffOpened")}
                                  >
                                    Write off
                                  </button>
                                </>
                              )}
                              <Link
                                href="/purchasing"
                                className="text-xs font-medium text-slate-600 hover:underline"
                              >
                                Purchase
                              </Link>
                              <button
                                type="button"
                                className="text-xs font-medium text-rose-600 hover:underline"
                                onClick={() => remove(p.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {!pagedProducts.length && (
                    <tr>
                      <td
                        colSpan={visibleColCount}
                        className="px-3 py-10 text-center text-slate-500"
                      >
                        No products match these filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
              <span>
                {filteredProducts.length
                  ? `Showing ${pageStart} - ${pageEnd} of ${filteredProducts.length}`
                  : "Showing 0 of 0"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="sf-btn sf-btn-ghost"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="sf-btn sf-btn-ghost"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : tab === "returns" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sf-thead">
                <tr>
                  <th className="px-3 py-2.5">Return SKU</th>
                  <th className="px-3 py-2.5">Parent product</th>
                  <th className="px-3 py-2.5">Qty</th>
                  <th className="px-3 py-2.5">Sell price</th>
                  <th className="px-3 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReturns.map((p) => (
                  <tr key={p.id} className="sf-row">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{p.name}</div>
                      <div className="font-mono text-xs text-slate-500">{p.sku}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {p.parentProduct?.name || "-"}
                      {p.parentProduct?.sku && (
                        <span className="ml-1 font-mono text-xs text-slate-400">
                          ({p.parentProduct.sku})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-medium tabular-nums">
                      {p.qty} {p.unit}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{formatKes(p.sellPrice)}</td>
                    <td className="px-3 py-2.5">
                      {canEdit && (
                        <button
                          type="button"
                          className="sf-link text-xs"
                          onClick={() => openEdit(p)}
                        >
                          Edit price
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!filteredReturns.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                      No return SKUs yet. Opened refunds create them automatically.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {canEdit && (
              <form onSubmit={addCategory} className="flex flex-wrap gap-2">
                <input
                  className="sf-input max-w-xs flex-1"
                  placeholder="New category name"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <button type="submit" className="sf-btn sf-btn-primary">
                  + Add category
                </button>
              </form>
            )}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sf-thead">
                  <tr>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5">Products</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((c) => (
                    <tr key={c.id} className="sf-row">
                      <td className="px-3 py-2.5 font-medium">{c.name}</td>
                      <td className="px-3 py-2.5 tabular-nums">{c.productCount}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          className="sf-link text-xs"
                          onClick={() => {
                            setTab("products");
                            setCategoryId(c.id);
                          }}
                        >
                          View products
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!categoryRows.length && (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-slate-500">
                        No categories yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="sf-modal-backdrop">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveProduct(false);
            }}
            className="sf-modal max-h-[90vh] max-w-lg overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {editing ? "Edit product" : "Add product"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editing
                    ? "Update prices, stock, and details for this product."
                    : "Add a new product to your inventory. You can organize categories later from the Categories tab."}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
                onClick={() => setShowForm(false)}
              >
                x
              </button>
            </div>

            {error && <p className="sf-alert sf-alert-error mt-3">{error}</p>}

            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Name
                <input
                  className="sf-input mt-1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Bamburi Cement 50kg"
                  required
                  autoFocus
                />
              </label>

              <label className="block text-sm font-medium">
                Unit of measure
                <select
                  className="sf-select mt-1"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                >
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Sell price (KSh)
                  <input
                    className="sf-input mt-1"
                    value={form.sellPrice}
                    onChange={(e) => setForm({ ...form, sellPrice: e.target.value })}
                    required
                    type="number"
                    min={0}
                    step="0.01"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Cost price (KSh)
                  <input
                    className="sf-input mt-1"
                    value={form.cost}
                    onChange={(e) => setForm({ ...form, cost: e.target.value })}
                    required
                    type="number"
                    min={0}
                    step="0.01"
                  />
                </label>
              </div>

              <div className="sf-panel flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  Suggested sell at {form.markup}% markup:{" "}
                  <strong>{formatKes(suggested)}</strong>
                  <span className="ml-2 text-xs text-slate-500">
                    margin {previewMargin.toFixed(1)}%
                  </span>
                </span>
                <button
                  type="button"
                  className="sf-btn sf-btn-ghost px-2 py-1 text-xs"
                  onClick={() => setForm({ ...form, sellPrice: String(suggested) })}
                >
                  Use suggested
                </button>
              </div>

              <label className="block text-sm font-medium">
                Quantity
                <input
                  className="sf-input mt-1"
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })}
                  type="number"
                  min={0}
                  step="0.01"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Count (pcs), weight (kg, g), or volume (L, m)
                </span>
              </label>

              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left text-sm font-semibold text-[var(--sf-brand)]"
                  onClick={() => setShowMore((v) => !v)}
                >
                  More details (optional)
                  <span className="text-slate-400">{showMore ? "-" : "+"}</span>
                </button>

                {showMore && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm sm:col-span-2">
                      SKU
                      <input
                        className="sf-input mt-1"
                        value={form.sku}
                        onChange={(e) => setForm({ ...form, sku: e.target.value })}
                        placeholder={editing ? undefined : "Auto-generated if left blank"}
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      Category
                      <select
                        className="sf-select mt-1"
                        value={form.categoryId}
                        onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                      >
                        <option value="">Select category</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      Barcode (optional)
                      <input
                        className="sf-input mt-1"
                        value={form.barcode}
                        onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                        placeholder="e.g. 6001001001003"
                      />
                    </label>
                    <label className="block text-sm">
                      Reorder level
                      <input
                        className="sf-input mt-1"
                        value={form.reorderLevel}
                        onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
                        type="number"
                        min={0}
                        step="0.01"
                      />
                      <span className="mt-1 block text-xs text-slate-500">
                        Alert when stock drops below this number
                      </span>
                    </label>
                    <label className="block text-sm">
                      Markup %
                      <input
                        className="sf-input mt-1"
                        value={form.markup}
                        onChange={(e) => setForm({ ...form, markup: e.target.value })}
                        type="number"
                        step="0.1"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={form.trackSerial}
                        onChange={(e) => setForm({ ...form, trackSerial: e.target.checked })}
                      />
                      Track serial numbers (tools / appliances)
                    </label>
                    <div className="sm:col-span-2">
                      <div className="text-sm font-medium">Image (optional)</div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Upload a JPG, PNG, or WebP from your device (max 2 MB).
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {(imagePreview || form.imageUrl) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imagePreview || form.imageUrl}
                            alt=""
                            className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200"
                          />
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="sf-btn sf-btn-ghost"
                            onClick={() => imageInputRef.current?.click()}
                          >
                            {form.imageUrl || imageFile ? "Change image" : "Choose image"}
                          </button>
                          {(form.imageUrl || imageFile) && (
                            <button
                              type="button"
                              className="sf-btn sf-btn-ghost text-rose-600"
                              onClick={() => {
                                clearImageSelection();
                                setForm({ ...form, imageUrl: "" });
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <input
                          ref={imageInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => onPickImage(e.target.files?.[0] || null)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="sf-btn sf-btn-ghost"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              {!editing && (
                <button
                  type="button"
                  disabled={saving}
                  className="sf-btn sf-btn-ghost"
                  onClick={() => saveProduct(true)}
                >
                  Save & add another
                </button>
              )}
              <button type="submit" disabled={saving} className="sf-btn sf-btn-primary">
                {saving ? "Saving..." : editing ? "Save changes" : "Add product"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
