"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatKes, marginPercent, suggestedSellPrice } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import { useSession } from "next-auth/react";
import { hasPermission } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SelectMenu } from "@/components/ui/select-menu";
import { useToast } from "@/components/ui/toast";

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
  | "identifiers"
  | "category"
  | "pricing"
  | "margin"
  | "qty"
  | "returns"
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
  { key: "identifiers", label: "SKU / Barcode", defaultOn: true },
  { key: "category", label: "Category", defaultOn: true },
  { key: "pricing", label: "Cost → Sell", defaultOn: true },
  { key: "margin", label: "Margin", defaultOn: true },
  { key: "qty", label: "Quantity", defaultOn: true },
  { key: "returns", label: "Returns", defaultOn: false },
  { key: "cog", label: "Stock value", defaultOn: false },
  { key: "alert", label: "Status", defaultOn: true },
];

function stockStatus(qty: number, reorderLevel: number) {
  if (qty <= 0) return { label: "OUT OF STOCK", tone: "bg-rose-100 text-rose-800" };
  if (qty <= reorderLevel) return { label: "LOW STOCK", tone: "bg-amber-100 text-amber-900" };
  return { label: "IN STOCK", tone: "bg-emerald-100 text-emerald-800" };
}

const AVATAR_TONES = [
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-800",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-cyan-100 text-cyan-800",
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function avatarTone(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
  return AVATAR_TONES[h];
}

function shortKes(n: number) {
  if (Math.abs(n) >= 1_000_000) return `KSh ${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1_000) return `KSh ${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return formatKes(n);
}

function markupPercent(cost: number, sell: number) {
  if (cost <= 0) return 0;
  return ((sell - cost) / cost) * 100;
}

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
  const router = useRouter();
  const { data: session } = useSession();
  const toast = useToast();
  const canEdit = hasPermission(session?.user, "inventory.manage");
  const canPurchase = hasPermission(session?.user, "purchasing.manage");
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
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState(defaultColumns);
  const [showColumns, setShowColumns] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<{
    id: string;
    name: string;
    productCount: number;
  } | null>(null);
  const [deleteCategoryBusy, setDeleteCategoryBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [showHeaderMore, setShowHeaderMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Product | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  const [notice, setNotice] = useState<null | { title: string; message: string }>(null);

  const ghostBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50";
  const primaryBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50";
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
      const target = e.target as HTMLElement | null;
      if (!columnsRef.current?.contains(e.target as Node)) {
        setShowColumns(false);
      }
      if (!target?.closest("[data-inv-header-menu]")) {
        setShowHeaderMore(false);
      }
    }
    if (showColumns || showHeaderMore) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showColumns, showHeaderMore]);

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
    const units = sellable.reduce((s, p) => s + p.qty, 0);
    const stockValue = sellable.reduce((s, p) => s + p.cost * p.qty, 0);
    const retailValue = sellable.reduce((s, p) => s + p.sellPrice * p.qty, 0);
    const below = sellable.filter((p) => p.qty <= p.reorderLevel && p.qty > 0).length;
    const out = sellable.filter((p) => p.qty <= 0).length;
    const returnUnits = returnSkus.reduce((s, p) => s + p.qty, 0);
    const returnValue = returnSkus.reduce((s, p) => s + p.cost * p.qty, 0);
    const uncategorized = sellable.filter((p) => !p.categoryId).length;
    const blendedMargin = retailValue > 0 ? ((retailValue - stockValue) / retailValue) * 100 : 0;
    return {
      stockValue,
      retailValue,
      blendedMargin,
      units,
      count: sellable.length,
      below,
      out,
      returnUnits,
      returnValue,
      returnCount: returnSkus.length,
      categories: categories.length,
      uncategorized,
    };
  }, [sellable, returnSkus, categories]);

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
    COLUMN_OPTIONS.filter((c) => c.key !== "photo" && columns[c.key]).length +
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
    if (form.sellPrice === "" || !Number.isFinite(Number(form.sellPrice)) || Number(form.sellPrice) < 0) {
      setError("Sell price cannot be negative");
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

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    setDeactivateBusy(true);
    try {
      const res = await fetch(`/api/products/${deactivateTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeactivateTarget(null);
        setNotice({
          title: "Could not deactivate product",
          message: data.error || "Something went wrong. Try again.",
        });
        return;
      }
      setDeactivateTarget(null);
      load();
    } finally {
      setDeactivateBusy(false);
    }
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
      setNotice({
        title: "Could not update return stock",
        message: data.error || "Something went wrong. Try again.",
      });
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
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/products/import", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    const rowErrors = Array.isArray(data.errors)
      ? data.errors.filter((e: unknown): e is string => typeof e === "string" && e.trim())
      : [];
    const errorCount =
      typeof data.errorCount === "number" && data.errorCount > 0
        ? data.errorCount
        : rowErrors.length;
    const created = Number(data.created) || 0;
    const updated = Number(data.updated) || 0;

    function importErrorToast() {
      const first = (rowErrors[0] || "").trim();
      const friendly = first
        ? first.replace(/^Row\s+\d+:\s*/i, "").replace(/^\w/, (c) => c.toUpperCase())
        : "Some rows could not be imported. Check cost, sell price, name, and SKU.";
      const extra = errorCount > 1 ? ` (${errorCount} rows need fixing)` : "";
      toast.error(`${friendly}${extra}`);
    }

    if (!res.ok) {
      if (typeof data.error === "string" && data.error.trim() && !rowErrors.length) {
        toast.error(data.error.trim());
      } else {
        importErrorToast();
      }
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    if (created + updated > 0) {
      const parts = [];
      if (created) parts.push(`${created} created`);
      if (updated) parts.push(`${updated} updated`);
      const cats = Number(data.categoriesCreated) || 0;
      if (cats) parts.push(`${cats} new categor${cats === 1 ? "y" : "ies"}`);
      toast.success(`Import complete — ${parts.join(", ")}`);
    }
    if (errorCount > 0) {
      importErrorToast();
    }

    load();
    if (fileRef.current) fileRef.current.value = "";
  }

  function openAddCategory() {
    setEditingCategory(null);
    setNewCategory("");
    setCategoryError("");
    setShowCategoryForm(true);
  }

  function openEditCategory(c: Category) {
    setEditingCategory(c);
    setNewCategory(c.name);
    setCategoryError("");
    setShowCategoryForm(true);
  }

  function closeCategoryForm() {
    setShowCategoryForm(false);
    setEditingCategory(null);
    setNewCategory("");
    setCategoryError("");
  }

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name) {
      setCategoryError("Enter a category name");
      return;
    }
    setSavingCategory(true);
    setCategoryError("");
    const res = editingCategory
      ? await fetch(`/api/categories/${editingCategory.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        })
      : await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
    const data = await res.json().catch(() => ({}));
    setSavingCategory(false);
    if (!res.ok) {
      setCategoryError(
        data.error || (editingCategory ? "Could not rename category" : "Could not add category")
      );
      return;
    }
    const createdId = !editingCategory && data?.id ? String(data.id) : "";
    closeCategoryForm();
    if (showForm && createdId) {
      setForm((f) => ({ ...f, categoryId: createdId }));
    }
    load();
  }

  async function confirmDeleteCategory() {
    if (!deleteCategoryTarget) return;
    setDeleteCategoryBusy(true);
    try {
      const res = await fetch(`/api/categories/${deleteCategoryTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteCategoryTarget(null);
        setNotice({
          title: "Could not delete category",
          message: data.error || "Something went wrong. Try again.",
        });
        return;
      }
      if (categoryId === deleteCategoryTarget.id) setCategoryId("");
      setDeleteCategoryTarget(null);
      load();
    } finally {
      setDeleteCategoryBusy(false);
    }
  }

  const alertActive = tab === "products" && (status === "low" || status === "out");

  return (
    <div className="space-y-4 px-1 py-1 sm:px-0 [font-variant-numeric:tabular-nums]">
      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
        aria-label="Inventory overview"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              Inventory
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">
                Stock and product master at {branchName}
              </span>
              {stats.below + stats.out > 0 && (
                <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                  {stats.below + stats.out} need restock
                </span>
              )}
              {stats.returnUnits > 0 && (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  {stats.returnUnits.toLocaleString()} return units
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative" data-inv-header-menu>
              <button
                type="button"
                className={ghostBtn}
                aria-expanded={showHeaderMore}
                onClick={() => setShowHeaderMore((v) => !v)}
              >
                More
                <svg className="size-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showHeaderMore && (
                <div className="absolute end-0 z-30 mt-1.5 w-44 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200">
                  <button
                    type="button"
                    className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setShowHeaderMore(false);
                      exportCsv();
                    }}
                  >
                    Export CSV
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          setShowHeaderMore(false);
                          downloadTemplate();
                        }}
                      >
                        CSV template
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          setShowHeaderMore(false);
                          fileRef.current?.click();
                        }}
                      >
                        Import CSV
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {canEdit && (
              <button type="button" className={primaryBtn} onClick={openCreate}>
                + Add product
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onImportFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 border-t border-slate-200 lg:grid-cols-4 lg:divide-y-0">
          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              tab === "products" && status === "all" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setTab("products");
              setStatus("all");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Stock at cost
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {shortKes(stats.stockValue)}
              </span>
              <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700">
                {stats.count} SKUs
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {stats.units.toLocaleString()} units · retail {shortKes(stats.retailValue)}
            </p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              {stats.blendedMargin.toFixed(1)}% margin →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              alertActive ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => {
              setTab("products");
              setStatus(stats.out > 0 ? "out" : "low");
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Low / Out of stock
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span
                className={`font-mono text-base font-bold tracking-tight sm:text-lg ${
                  stats.below + stats.out > 0 ? "text-rose-600" : "text-slate-900"
                }`}
              >
                {stats.below} / {stats.out}
              </span>
            </div>
            {stats.below + stats.out > 0 ? (
              <p className="mt-1.5 inline-flex items-center self-start rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                Needs restock attention
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">Stock levels healthy</p>
            )}
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              View alerts →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              tab === "returns" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => setTab("returns")}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Return stock
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {stats.returnUnits.toLocaleString()}
              </span>
              {stats.returnValue > 0 && (
                <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                  {shortKes(stats.returnValue)}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {stats.returnCount} return SKU{stats.returnCount === 1 ? "" : "s"}
            </p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              View returns →
            </span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              tab === "categories" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => setTab("categories")}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Categories
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {stats.categories}
              </span>
            </div>
            {stats.uncategorized > 0 ? (
              <p className="mt-1.5 inline-flex items-center self-start rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                {stats.uncategorized} uncategorized
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">All products categorized</p>
            )}
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
              Manage categories →
            </span>
          </button>
        </div>
      </section>

      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
        aria-label="Inventory records"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2.5 sm:px-4">
          <div role="tablist" aria-label="Inventory records" className="inline-flex rounded-md bg-indigo-50 p-0.5">
            {(
              [
                ["products", "Products", sellable.length],
                ["returns", "Return SKUs", returnSkus.length],
                ["categories", "Categories", categories.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`h-7 rounded-md px-2.5 text-xs transition ${
                  tab === key
                    ? "bg-indigo-600 font-semibold text-white shadow-sm"
                    : "font-medium text-slate-600 hover:text-slate-900"
                }`}
                onClick={() => setTab(key)}
              >
                {label}{" "}
                <span className={tab === key ? "ml-1 font-medium text-indigo-200" : "ml-1 text-slate-500"}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {tab !== "categories" && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
            <label className="relative min-w-[160px] flex-1 sm:max-w-xs">
              <span className="sr-only">Search inventory</span>
              <input
                type="search"
                placeholder={
                  tab === "returns"
                    ? "Search return SKU or parent product"
                    : "Search name, SKU, barcode…"
                }
                className="h-8 w-full rounded-lg border-0 bg-white px-2.5 text-xs ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            {tab === "products" && (
              <>
                <select
                  className="h-8 min-w-[130px] appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  aria-label="Category"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-8 min-w-[120px] appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StatusFilter)}
                  aria-label="Status"
                >
                  <option value="all">All status</option>
                  <option value="in_stock">In stock</option>
                  <option value="low">Below reorder</option>
                  <option value="out">Out of stock</option>
                </select>
                <div className="relative" ref={columnsRef}>
                  <button
                    type="button"
                    className={ghostBtn}
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
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Product
                    </th>
                    {col("identifiers") && (
                      <th className="px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Identifiers
                      </th>
                    )}
                    {col("category") && (
                      <th className="px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Category / Unit
                      </th>
                    )}
                    {col("pricing") && (
                      <th className="px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Cost → Sell
                      </th>
                    )}
                    {col("margin") && (
                      <th className="px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Margin
                      </th>
                    )}
                    {col("qty") && (
                      <th className="px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {branchName}
                      </th>
                    )}
                    {col("returns") && (
                      <th className="px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Returns
                      </th>
                    )}
                    {col("cog") && (
                      <th className="px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Stock value
                      </th>
                    )}
                    {col("alert") && (
                      <th className="px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </th>
                    )}
                    {canEdit && (
                      <th className="px-3 py-2.5 text-end text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Product Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pagedProducts.map((p) => {
                    const statusPill = stockStatus(p.qty, p.reorderLevel);
                    const margin = marginPercent(p.cost, p.sellPrice);
                    const markup = markupPercent(p.cost, p.sellPrice);
                    const returnQty =
                      p.returnSkus?.reduce((s, r) => s + r.qty, 0) || p.openedQty || 0;
                    const outOfStock = p.qty <= 0;
                    const orderHref =
                      outOfStock && canPurchase
                        ? `/purchasing?productId=${encodeURIComponent(p.id)}&compose=po`
                        : null;
                    return (
                      <tr
                        key={p.id}
                        className={`border-b border-slate-50 hover:bg-slate-50/70 ${
                          orderHref ? "cursor-pointer" : ""
                        }`}
                        title={orderHref ? "Out of stock — click to create a purchase order" : undefined}
                        onClick={
                          orderHref
                            ? () => router.push(orderHref)
                            : undefined
                        }
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {col("photo") ? (
                              p.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.imageUrl}
                                  alt=""
                                  className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200"
                                />
                              ) : (
                                <div
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${avatarTone(p.id)}`}
                                >
                                  {initials(p.name)}
                                </div>
                              )
                            ) : null}
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-[var(--sf-brand)]">
                                {p.name}
                              </div>
                              {p.trackSerial && (
                                <span className="mt-0.5 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                  Serial
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        {col("identifiers") && (
                          <td className="px-3 py-3 font-mono text-xs">
                            <div className="font-semibold text-slate-800">{p.sku}</div>
                            <div className="mt-0.5 text-slate-500">{p.barcode || "—"}</div>
                          </td>
                        )}
                        {col("category") && (
                          <td className="px-3 py-3 text-slate-600">
                            <div>{p.category?.name || "Uncategorized"}</div>
                            <div className="mt-0.5 text-xs text-slate-400">per {p.unit}</div>
                          </td>
                        )}
                        {col("pricing") && (
                          <td className="px-3 py-3 tabular-nums">
                            <div className="text-slate-400">{formatKes(p.cost)}</div>
                            <div className="mt-0.5 font-semibold text-slate-900">
                              {formatKes(p.sellPrice)}
                            </div>
                          </td>
                        )}
                        {col("margin") && (
                          <td className="px-3 py-3 tabular-nums">
                            <div
                              className={`font-semibold ${
                                margin < 15 ? "text-amber-700" : "text-emerald-700"
                              }`}
                            >
                              {margin.toFixed(1)}%
                            </div>
                            <div className="mt-0.5 text-xs text-slate-400">
                              {markup.toFixed(0)}% markup
                            </div>
                          </td>
                        )}
                        {col("qty") && (
                          <td className="px-3 py-3">
                            <div
                              className={`font-semibold tabular-nums ${
                                p.qty <= p.reorderLevel ? "text-rose-700" : "text-slate-900"
                              }`}
                            >
                              {p.qty} {p.unit}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-400">
                              reorder {p.reorderLevel}
                            </div>
                          </td>
                        )}
                        {col("returns") && (
                          <td className="px-3 py-3">
                            {returnQty > 0 ? (
                              <span className="sf-badge bg-amber-100 text-amber-900">
                                {returnQty} {p.unit}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        )}
                        {col("cog") && (
                          <td className="px-3 py-3 tabular-nums">{formatKes(p.cost * p.qty)}</td>
                        )}
                        {col("alert") && (
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${statusPill.tone}`}
                            >
                              {statusPill.label}
                              {orderHref ? (
                                <span className="font-bold opacity-80">· Order</span>
                              ) : null}
                            </span>
                          </td>
                        )}
                        {canEdit && (
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                title="Edit product"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-bold text-[var(--sf-accent-deep)] shadow-sm hover:bg-[var(--sf-accent-soft)]"
                                onClick={() => openEdit(p)}
                              >
                                <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                Edit
                              </button>
                              {returnQty > 0 && (
                                <>
                                  <button
                                    type="button"
                                    title="Release return stock"
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-800 shadow-sm hover:bg-amber-50"
                                    onClick={() => quarantineAction(p, "releaseOpened")}
                                  >
                                    Release
                                  </button>
                                  <button
                                    type="button"
                                    title="Write off return stock"
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-800 shadow-sm hover:bg-amber-50"
                                    onClick={() => quarantineAction(p, "writeOffOpened")}
                                  >
                                    Write off
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                title="Delete product"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 shadow-sm hover:bg-rose-50"
                                onClick={() => setDeactivateTarget(p)}
                              >
                                <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8" />
                                </svg>
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
                        className="px-4 py-10 text-center text-slate-500"
                      >
                        No products match these filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  {filteredProducts.length
                    ? `Showing ${pageStart} - ${pageEnd} of ${filteredProducts.length}`
                    : "Showing 0 of 0"}
                </span>
                <label className="inline-flex items-center gap-2 text-slate-500">
                  <span>Per page</span>
                  <select
                    className="h-8 appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-xs text-slate-700 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    aria-label="Rows per page"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
              </div>
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
                  <th className="px-3 py-2.5 text-end text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Product Actions
                  </th>
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
                        <div className="flex justify-end">
                          <button
                            type="button"
                            title="Edit price"
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-bold text-[var(--sf-accent-deep)] shadow-sm hover:bg-[var(--sf-accent-soft)]"
                            onClick={() => openEdit(p)}
                          >
                            <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Edit price
                          </button>
                        </div>
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
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">Categories</p>
                <p className="text-[11px] text-slate-500">
                  {categories.length
                    ? `${categories.length} categor${categories.length === 1 ? "y" : "ies"} for product grouping`
                    : "Group products for faster POS and reports"}
                </p>
              </div>
              {canEdit ? (
                <button type="button" className={primaryBtn} onClick={openAddCategory}>
                  + Add category
                </button>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2.5 sm:px-4">Category</th>
                    <th className="px-3 py-2.5 sm:px-4">Products</th>
                    <th className="px-3 py-2.5 text-right sm:px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-3 py-2.5 font-medium text-slate-900 sm:px-4">{c.name}</td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-600 sm:px-4">
                        {c.productCount}
                      </td>
                      <td className="px-3 py-2.5 text-right sm:px-4">
                        {canEdit ? (
                          <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              title="Edit category"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-bold text-[var(--sf-accent-deep)] shadow-sm hover:bg-[var(--sf-accent-soft)]"
                              onClick={() => openEditCategory(c)}
                            >
                              <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                              Edit
                            </button>
                            <button
                              type="button"
                              title="Delete category"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 shadow-sm hover:bg-rose-50"
                              onClick={() =>
                                setDeleteCategoryTarget({
                                  id: c.id,
                                  name: c.name,
                                  productCount: c.productCount,
                                })
                              }
                            >
                              <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!categoryRows.length && (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center">
                        <p className="text-sm font-medium text-slate-700">No categories yet</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Add groups like Cement, Fasteners, or Tools to organize stock.
                        </p>
                        {canEdit ? (
                          <button
                            type="button"
                            className={`${primaryBtn} mt-3`}
                            onClick={openAddCategory}
                          >
                            + Add category
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

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
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0"
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
                    <div className="block text-sm sm:col-span-2">
                      <span className="block">Category</span>
                      <SelectMenu
                        className="mt-1"
                        value={form.categoryId}
                        onChange={(v) => setForm({ ...form, categoryId: v })}
                        placeholder="Select category"
                        searchable
                        searchPlaceholder="Search categories…"
                        triggerClassName="sf-select flex w-full items-center justify-between gap-2 text-left"
                        options={[
                          { value: "", label: "Select category" },
                          ...categories.map((c) => ({ value: c.id, label: c.name })),
                        ]}
                        actionLabel={canEdit ? "Add category" : undefined}
                        onAction={canEdit ? openAddCategory : undefined}
                      />
                    </div>
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

      {canEdit && showCategoryForm ? (
        <div className="sf-modal-backdrop">
          <form onSubmit={saveCategory} className="sf-modal max-w-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                  {editingCategory ? "Edit category" : "Add category"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editingCategory
                    ? "Rename this category. Products stay linked."
                    : "Name a group for products at POS and in reports."}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
                disabled={savingCategory}
                onClick={closeCategoryForm}
              >
                ×
              </button>
            </div>
            <label className="mt-4 block text-xs font-medium text-slate-500">
              Name
              <input
                type="text"
                autoFocus
                required
                placeholder="e.g. Fasteners"
                className="mt-1.5 h-10 w-full rounded-lg border-0 bg-white px-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
                value={newCategory}
                onChange={(e) => {
                  setNewCategory(e.target.value);
                  if (categoryError) setCategoryError("");
                }}
                disabled={savingCategory}
              />
            </label>
            {categoryError ? (
              <p className="mt-2 text-xs font-medium text-rose-600">{categoryError}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={ghostBtn}
                disabled={savingCategory}
                onClick={closeCategoryForm}
              >
                Cancel
              </button>
              <button type="submit" className={primaryBtn} disabled={savingCategory}>
                {savingCategory
                  ? "Saving…"
                  : editingCategory
                    ? "Save changes"
                    : "Add category"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        title={`Deactivate ${deactivateTarget?.name || "product"}?`}
        message="It will be hidden from POS and purchasing. Existing sales history stays on file."
        confirmLabel="Deactivate"
        tone="danger"
        loading={deactivateBusy}
        onCancel={() => {
          if (!deactivateBusy) setDeactivateTarget(null);
        }}
        onConfirm={confirmDeactivate}
      />

      <ConfirmDialog
        open={Boolean(notice)}
        title={notice?.title || ""}
        message={notice?.message || ""}
        confirmLabel="OK"
        hideCancel
        tone="danger"
        onCancel={() => setNotice(null)}
        onConfirm={() => setNotice(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteCategoryTarget)}
        title={`Delete ${deleteCategoryTarget?.name || "category"}?`}
        message={
          deleteCategoryTarget && deleteCategoryTarget.productCount > 0
            ? `${deleteCategoryTarget.productCount} product${
                deleteCategoryTarget.productCount === 1 ? "" : "s"
              } will become Uncategorized. This cannot be undone.`
            : "This category has no products. It will be removed permanently."
        }
        confirmLabel="Delete"
        tone="danger"
        loading={deleteCategoryBusy}
        onCancel={() => {
          if (!deleteCategoryBusy) setDeleteCategoryTarget(null);
        }}
        onConfirm={confirmDeleteCategory}
      />
    </div>
  );
}
