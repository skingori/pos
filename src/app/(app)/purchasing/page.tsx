"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { formatKes } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import { useSession } from "next-auth/react";
import { hasPermission } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { printThermalReceipt } from "@/lib/print-thermal";
import {
  ThermalPurchaseSlip,
  type ThermalPurchaseSlipData,
} from "@/components/thermal-purchase-slip";
import { IconClose } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Supplier = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
};
type Product = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string | null;
  cost: number;
  unit: string;
  trackSerial?: boolean;
  isReturnSku?: boolean;
};
type Purchase = {
  id: string;
  status: string;
  totalCost: number;
  note: string | null;
  createdAt: string;
  orderedAt: string | null;
  receivedAt: string | null;
  supplierId?: string | null;
  supplier: { name: string; phone?: string | null } | null;
  user: { name: string };
  lines: {
    productId?: string;
    qty: number;
    unitCost: number;
    product: { id?: string; name: string; unit?: string; sku?: string };
  }[];
};
type ShopSettings = {
  shopName: string;
  address?: string | null;
  phone?: string | null;
  kraPin?: string | null;
  receiptFooter?: string | null;
};

type PageTab = "purchases" | "suppliers";
type ViewFilter = "all" | "open" | "late" | "received";
type StatusFilter = "all" | "ORDERED" | "RECEIVED" | "CANCELLED";
type ComposeMode = "po" | "receive";
type DraftLine = {
  key: string;
  productId: string;
  name: string;
  unit: string;
  qty: number;
  unitCost: number;
  trackSerial?: boolean;
  serials: string;
};

const CSV_TEMPLATE =
  "supplier,note,product_sku,product_name,qty,unit_cost,received_at,purchase_ref\n" +
  "Nairobi Distributors,Opening stock,CEM-50,Bamburi Cement 50kg,100,750,2026-01-15,IMP-001\n";

function shortKes(n: number) {
  if (Math.abs(n) >= 1_000_000) return `KSh ${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1_000) return `KSh ${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return formatKes(n);
}

function purchaseRef(prefix: "PO" | "GRN", id: string) {
  return `${prefix}-${id.slice(-8).toUpperCase()}`;
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysOpen(iso: string | null | undefined) {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function statusTone(status: string) {
  if (status === "ORDERED") return "bg-amber-100 text-amber-900";
  if (status === "RECEIVED") return "bg-emerald-100 text-emerald-800";
  if (status === "CANCELLED") return "bg-slate-100 text-slate-600";
  return "bg-sky-100 text-sky-800";
}

function statusLabel(status: string, late: boolean) {
  if (late) return { label: "OVERDUE", tone: "bg-rose-100 text-rose-800" };
  if (status === "ORDERED") return { label: "OPEN PO", tone: "bg-amber-100 text-amber-900" };
  if (status === "RECEIVED") return { label: "RECEIVED", tone: "bg-emerald-100 text-emerald-800" };
  if (status === "CANCELLED") return { label: "CANCELLED", tone: "bg-slate-100 text-slate-600" };
  return { label: status, tone: statusTone(status) };
}

const ghostBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50";
const primaryBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50";
const outlineAccent = ghostBtn;

export default function PurchasingPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading purchasing…</p>}>
      <PurchasingInner />
    </Suspense>
  );
}

function PurchasingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const canEdit = hasPermission(session?.user, "purchasing.manage");

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<PageTab>("purchases");
  const [view, setView] = useState<ViewFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [supplierQ, setSupplierQ] = useState("");
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [showCompose, setShowCompose] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [composeMode, setComposeMode] = useState<ComposeMode>("receive");
  const [supplierId, setSupplierId] = useState("");
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editSupplierId, setEditSupplierId] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: "", phone: "", email: "" });
  const [productSearch, setProductSearch] = useState("");
  const [showProductMenu, setShowProductMenu] = useState(false);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [recalcSell, setRecalcSell] = useState(true);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const deepLinkHandled = useRef<string | null>(null);

  const [receiveId, setReceiveId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [printOnOpen, setPrintOnOpen] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [showHeaderMore, setShowHeaderMore] = useState(false);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    null | { kind: "purchase"; purchase: Purchase } | { kind: "supplier"; supplier: Supplier }
  >(null);

  async function load() {
    const [p, s, pr, st] = await Promise.all([
      fetch("/api/purchases").then((r) => r.json()),
      fetch("/api/suppliers").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()).catch(() => null),
    ]);
    setPurchases(Array.isArray(p) ? p : []);
    setSuppliers(Array.isArray(s) ? s : []);
    setProducts(Array.isArray(pr) ? pr.filter((x: Product) => !x.isReturnSku) : []);
    if (st && typeof st === "object") {
      setSettings({
        shopName: st.shopName || "Shop",
        address: st.address || null,
        phone: st.phone || null,
        kraPin: st.kraPin || null,
        receiptFooter: st.receiptFooter || null,
      });
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const productId = searchParams.get("productId");
    const compose = searchParams.get("compose");
    if (!productId || compose !== "po" || !canEdit) return;
    if (!products.length) return;
    const key = `${productId}:po`;
    if (deepLinkHandled.current === key) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    deepLinkHandled.current = key;
    setTab("purchases");
    setView("open");
    setError("");
    setEditId(null);
    setSupplierId("");
    setNote("");
    setProductSearch("");
    setShowProductMenu(false);
    setComposeMode("po");
    setLines([
      {
        key: `${product.id}-${Date.now()}`,
        productId: product.id,
        name: product.name,
        unit: product.unit,
        qty: 1,
        unitCost: product.cost || 0,
        trackSerial: Boolean(product.trackSerial),
        serials: "",
      },
    ]);
    setShowCompose(true);
    router.replace("/purchasing", { scroll: false });
    setTimeout(() => productSearchRef.current?.focus(), 50);
  }, [searchParams, products, canEdit, router]);

  useEffect(() => {
    if (!detailId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDetailId(null);
        setPrintOnOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detailId]);

  useEffect(() => {
    if (!detailId || !printOnOpen) return;
    const t = window.setTimeout(() => {
      printThermalReceipt("thermal-purchase-slip");
      setPrintOnOpen(false);
    }, 150);
    return () => window.clearTimeout(t);
  }, [detailId, printOnOpen]);

  useEffect(() => {
    if (!actionMenuId && !showHeaderMore) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-action-menu]")) return;
      setActionMenuId(null);
      setShowHeaderMore(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [actionMenuId, showHeaderMore]);

  const openOrders = useMemo(
    () => purchases.filter((p) => p.status === "ORDERED"),
    [purchases]
  );
  const received = useMemo(
    () => purchases.filter((p) => p.status === "RECEIVED"),
    [purchases]
  );
  const lateOrders = useMemo(
    () => openOrders.filter((p) => daysOpen(p.orderedAt || p.createdAt) >= 2),
    [openOrders]
  );

  const stats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const receivedMonth = received.filter(
      (p) => new Date(p.receivedAt || p.createdAt) >= monthStart
    );
    return {
      openCount: openOrders.length,
      openValue: openOrders.reduce((s, p) => s + p.totalCost, 0),
      lateCount: lateOrders.length,
      lateValue: lateOrders.reduce((s, p) => s + p.totalCost, 0),
      receivedMonthCount: receivedMonth.length,
      receivedMonthValue: receivedMonth.reduce((s, p) => s + p.totalCost, 0),
      allCount: purchases.length,
      allValue: purchases.reduce((s, p) => s + p.totalCost, 0),
    };
  }, [openOrders, lateOrders, received, purchases]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const supplierName = filterSupplierId
      ? suppliers.find((s) => s.id === filterSupplierId)?.name
      : null;

    return purchases.filter((p) => {
      if (view === "late") {
        if (p.status !== "ORDERED") return false;
        if (daysOpen(p.orderedAt || p.createdAt) < 2) return false;
      } else if (statusFilter !== "all") {
        if (p.status !== statusFilter) return false;
      } else if (view === "open" && p.status !== "ORDERED") {
        return false;
      } else if (view === "received" && p.status !== "RECEIVED") {
        return false;
      }
      if (supplierName && p.supplier?.name !== supplierName) return false;
      if (!term) return true;
      const hay = [
        purchaseRef("PO", p.id),
        purchaseRef("GRN", p.id),
        p.supplier?.name || "",
        p.status,
        p.note || "",
        ...p.lines.map((l) => l.product.name),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [purchases, view, statusFilter, q, filterSupplierId, suppliers]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = rows.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(safePage * pageSize, rows.length);
  const pagedRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, view, statusFilter, filterSupplierId, pageSize, tab]);

  const supplierRows = useMemo(() => {
    const term = supplierQ.trim().toLowerCase();
    const counts = new Map<string, { purchases: number; spent: number }>();
    for (const p of purchases) {
      const key = p.supplierId || p.supplier?.name;
      if (!key) continue;
      const cur = counts.get(key) || { purchases: 0, spent: 0 };
      cur.purchases += 1;
      cur.spent += p.totalCost;
      counts.set(key, cur);
      if (p.supplierId && p.supplier?.name) counts.set(p.supplier.name, cur);
    }

    return suppliers
      .filter((s) => {
        if (!term) return true;
        const hay = `${s.name} ${s.phone || ""} ${s.email || ""}`.toLowerCase();
        return hay.includes(term);
      })
      .map((s) => {
        const statsFor =
          counts.get(s.id) || counts.get(s.name) || { purchases: 0, spent: 0 };
        return { ...s, purchaseCount: statsFor.purchases, spent: statsFor.spent };
      });
  }, [suppliers, supplierQ, purchases]);

  const activeDetail = purchases.find((p) => p.id === detailId) || null;
  const composeTotal = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  const productSuggestions = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return products.slice(0, 8);
    return products
      .filter((p) => {
        const hay = `${p.name} ${p.sku || ""} ${p.barcode || ""}`.toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 8);
  }, [products, productSearch]);

  function resetCompose() {
    setLines([]);
    setProductSearch("");
    setShowProductMenu(false);
    setNote("");
    setSupplierId("");
    setEditId(null);
    setError("");
  }

  function openNewPurchase(mode: ComposeMode = "receive") {
    resetCompose();
    setComposeMode(mode);
    setShowCompose(true);
    setTimeout(() => productSearchRef.current?.focus(), 50);
  }

  function openEdit(p: Purchase) {
    if (p.status !== "ORDERED") return;
    setError("");
    setEditId(p.id);
    setComposeMode("po");
    setSupplierId(p.supplierId || "");
    setNote(p.note || "");
    setLines(
      p.lines.map((l, i) => {
        const productId = l.productId || l.product.id || "";
        const product = products.find(
          (x) => x.id === productId || x.name === l.product.name
        );
        return {
          key: `${productId || l.product.name}-${i}`,
          productId: productId || product?.id || "",
          name: l.product.name,
          unit: l.product.unit || product?.unit || "",
          qty: l.qty,
          unitCost: l.unitCost,
          trackSerial: Boolean(product?.trackSerial),
          serials: "",
        };
      })
    );
    setShowCompose(true);
  }

  function openDetail(id: string, print = false) {
    setDetailId(id);
    setPrintOnOpen(print);
  }

  function purchaseSlipData(p: Purchase): ThermalPurchaseSlipData {
    const isReceived = p.status === "RECEIVED";
    return {
      docType: isReceived ? "GRN" : "PO",
      reference: isReceived ? purchaseRef("GRN", p.id) : purchaseRef("PO", p.id),
      poReference: isReceived ? purchaseRef("PO", p.id) : null,
      status: p.status,
      totalCost: p.totalCost,
      note: p.note,
      lines: p.lines.map((l) => ({
        name: l.product.name,
        qty: l.qty,
        unitCost: l.unitCost,
        unit: l.product.unit,
      })),
      supplier: p.supplier
        ? { name: p.supplier.name, phone: p.supplier.phone }
        : null,
      userName: p.user.name,
      completedAt: isReceived
        ? p.receivedAt || p.createdAt
        : p.orderedAt || p.createdAt,
      shopName: settings?.shopName || "Shop",
      address: settings?.address,
      phone: settings?.phone,
      kraPin: settings?.kraPin,
      footer: settings?.receiptFooter,
    };
  }

  function addProduct(product: Product) {
    setError("");
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id && !l.trackSerial);
      if (existing) {
        return prev.map((l) =>
          l.key === existing.key ? { ...l, qty: l.qty + 1 } : l
        );
      }
      return [
        ...prev,
        {
          key: `${product.id}-${Date.now()}`,
          productId: product.id,
          name: product.name,
          unit: product.unit,
          qty: 1,
          unitCost: product.cost,
          trackSerial: Boolean(product.trackSerial),
          serials: "",
        },
      ];
    });
    setProductSearch("");
    setShowProductMenu(false);
    setTimeout(() => productSearchRef.current?.focus(), 0);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "purchases-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const exportRows = rows.flatMap((p) =>
      p.lines.map((l) => ({
        reference:
          p.status === "RECEIVED" ? purchaseRef("GRN", p.id) : purchaseRef("PO", p.id),
        status: p.status,
        supplier: p.supplier?.name || "",
        note: p.note || "",
        product_sku: l.product.sku || "",
        product_name: l.product.name,
        qty: l.qty,
        unit_cost: l.unitCost,
        line_total: l.qty * l.unitCost,
        date:
          p.status === "RECEIVED"
            ? (p.receivedAt || p.createdAt).slice(0, 10)
            : (p.orderedAt || p.createdAt).slice(0, 10),
      }))
    );
    const blob = new Blob([toCsv(exportRows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchases-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(file: File | null) {
    if (!file) return;
    setImportMsg("");
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/purchases/import", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      setImportMsg(data.error || "Import failed");
      return;
    }
    setImportMsg(
      `Imported: ${data.created} purchase${data.created === 1 ? "" : "s"}, ${data.lineCount} line${data.lineCount === 1 ? "" : "s"}` +
        (data.errorCount ? ` — ${data.errorCount} row error(s)` : "")
    );
    await load();
    setTab("purchases");
    setView("received");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submitCompose() {
    setError("");
    if (!lines.length) {
      setError("Add at least one line");
      return;
    }
    for (const l of lines) {
      if (!l.productId) {
        setError(`${l.name}: product is missing — remove and re-add`);
        return;
      }
      if (l.qty <= 0) {
        setError(`${l.name}: quantity must be greater than 0`);
        return;
      }
      if (l.trackSerial) {
        const list = l.serials
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (list.length !== Math.round(l.qty)) {
          setError(`${l.name} needs ${Math.round(l.qty)} serial number(s)`);
          return;
        }
      }
    }

    const payloadLines = lines.map((l) => ({
      productId: l.productId,
      qty: l.qty,
      unitCost: l.unitCost,
      serials: l.trackSerial ? l.serials : undefined,
    }));

    setBusy(true);
    const res = editId
      ? await fetch("/api/purchases", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editId,
            action: "update",
            supplierId: supplierId || null,
            note: note || null,
            lines: payloadLines,
          }),
        })
      : await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplierId: supplierId || null,
            note: note || null,
            recalculateSellFromMarkup: recalcSell,
            status: composeMode === "po" ? "ORDERED" : "RECEIVED",
            lines: payloadLines,
          }),
        });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setShowCompose(false);
    resetCompose();
    await load();
    setTab("purchases");
    if (!editId && composeMode === "receive") {
      setView("received");
      setDetailId(data.id);
    } else {
      setView("open");
    }
  }

  async function receiveOrder(id: string) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, recalculateSellFromMarkup: recalcSell }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Receive failed");
      return;
    }
    setReceiveId(null);
    await load();
    setTab("purchases");
    setView("received");
    setDetailId(id);
  }

  async function cancelOrder(id: string) {
    setBusy(true);
    const res = await fetch("/api/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "cancel" }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Cancel failed");
      return;
    }
    load();
  }

  function askDeletePurchase(p: Purchase) {
    if (p.status === "RECEIVED") return;
    setConfirmDelete({ kind: "purchase", purchase: p });
  }

  async function runDeletePurchase(p: Purchase) {
    setBusy(true);
    const res = await fetch(`/api/purchases?id=${encodeURIComponent(p.id)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setConfirmDelete(null);
      setError(data.error || "Could not delete purchase");
      return;
    }
    setConfirmDelete(null);
    if (detailId === p.id) setDetailId(null);
    load();
  }

  function openAddSupplier() {
    setError("");
    setEditSupplierId(null);
    setSupplierForm({ name: "", phone: "", email: "" });
    setShowSupplierModal(true);
  }

  function openEditSupplier(s: Supplier) {
    setError("");
    setEditSupplierId(s.id);
    setSupplierForm({
      name: s.name,
      phone: s.phone || "",
      email: s.email || "",
    });
    setShowSupplierModal(true);
  }

  function closeSupplierModal() {
    setShowSupplierModal(false);
    setEditSupplierId(null);
    setSupplierForm({ name: "", phone: "", email: "" });
    setError("");
  }

  async function saveSupplier(e?: React.FormEvent) {
    e?.preventDefault();
    if (!supplierForm.name.trim()) return;
    setBusy(true);
    setError("");
    const payload = {
      name: supplierForm.name.trim(),
      phone: supplierForm.phone.trim() || null,
      email: supplierForm.email.trim() || null,
    };
    const res = editSupplierId
      ? await fetch(`/api/suppliers/${editSupplierId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || (editSupplierId ? "Could not update supplier" : "Could not add supplier"));
      return;
    }
    closeSupplierModal();
    await load();
    setTab("suppliers");
  }

  function askDeleteSupplier(s: Supplier) {
    setConfirmDelete({ kind: "supplier", supplier: s });
  }

  async function runDeleteSupplier(s: Supplier) {
    setBusy(true);
    const res = await fetch(`/api/suppliers/${s.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setConfirmDelete(null);
      setError(data.error || "Could not delete supplier");
      return;
    }
    setConfirmDelete(null);
    if (data.softDeleted) {
      setImportMsg(`${s.name} had purchases — deactivated instead of deleted.`);
    }
    if (filterSupplierId === s.id) setFilterSupplierId("");
    if (supplierId === s.id) setSupplierId("");
    load();
  }

  function selectView(next: ViewFilter) {
    setTab("purchases");
    setView(next);
    if (next === "open" || next === "late") setStatusFilter("ORDERED");
    else if (next === "received") setStatusFilter("RECEIVED");
    else setStatusFilter("all");
  }

  function selectStatus(next: StatusFilter) {
    setStatusFilter(next);
    if (next === "ORDERED") setView("open");
    else if (next === "RECEIVED") setView("received");
    else setView("all");
  }

  return (
    <div className="space-y-4 px-1 py-1 sm:px-0 [font-variant-numeric:tabular-nums]">
      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200 print:hidden"
        aria-label="Purchasing overview"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              Purchasing
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">
                Orders, receipts, and suppliers
              </span>
              {stats.lateCount > 0 && (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  {stats.lateCount} overdue
                </span>
              )}
              {stats.openCount > 0 && (
                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  {stats.openCount} open
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative" data-action-menu>
              <button
                type="button"
                className={ghostBtn}
                aria-expanded={showHeaderMore}
                onClick={() => {
                  setShowHeaderMore((v) => !v);
                  setActionMenuId(null);
                }}
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
                      <button
                        type="button"
                        className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          setShowHeaderMore(false);
                          openAddSupplier();
                        }}
                      >
                        Add supplier
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {canEdit && (
              <button
                type="button"
                className={primaryBtn}
                onClick={() => openNewPurchase(tab === "purchases" && view === "open" ? "po" : "receive")}
              >
                + New purchase
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
              tab === "purchases" && view === "open" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => selectView("open")}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Open orders</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {stats.openCount}
              </span>
              {stats.openValue > 0 && (
                <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700">
                  {shortKes(stats.openValue)}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Waiting to receive</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">View open →</span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              tab === "purchases" && view === "late" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => selectView("late")}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Overdue</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span
                className={`font-mono text-base font-bold tracking-tight sm:text-lg ${
                  stats.lateCount > 0 ? "text-amber-700" : "text-slate-900"
                }`}
              >
                {stats.lateCount}
              </span>
              {stats.lateValue > 0 && (
                <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                  {shortKes(stats.lateValue)}
                </span>
              )}
            </div>
            {stats.lateCount > 0 ? (
              <p className="mt-1.5 inline-flex items-center self-start rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                Open ≥2 days
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">Nothing overdue</p>
            )}
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">View overdue →</span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              tab === "purchases" && view === "received" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => selectView("received")}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Received this month
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {stats.receivedMonthCount}
              </span>
              {stats.receivedMonthValue > 0 && (
                <span className="rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-medium text-emerald-800">
                  +{shortKes(stats.receivedMonthValue)}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Stock posted this month</p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">View GRNs →</span>
          </button>

          <button
            type="button"
            className={`flex flex-col px-3 py-2.5 text-left sm:px-4 ${
              tab === "purchases" && view === "all" ? "bg-indigo-50/60" : "hover:bg-slate-50"
            }`}
            onClick={() => selectView("all")}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">All purchases</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {stats.allCount}
              </span>
              <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700">
                {shortKes(stats.allValue)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}
            </p>
            <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">View all →</span>
          </button>
        </div>
      </section>

      {error && !showCompose && !showSupplierModal && !receiveId && (
        <p className="sf-alert sf-alert-error print:hidden">{error}</p>
      )}
      {importMsg && <p className="print:hidden text-sm text-teal-800">{importMsg}</p>}

      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200 print:border-0 print:shadow-none"
        aria-label="Purchasing records"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2.5 sm:px-4 print:hidden">
          <div role="tablist" aria-label="Purchasing records" className="inline-flex rounded-md bg-indigo-50 p-0.5">
            {(
              [
                ["purchases", "Purchases", purchases.length],
                ["suppliers", "Suppliers", suppliers.length],
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
          {canEdit && tab === "suppliers" && (
            <button type="button" className={ghostBtn} onClick={openAddSupplier}>
              + Add supplier
            </button>
          )}
        </div>

        {tab === "purchases" ? (
          <>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4 print:hidden">
              <label className="relative min-w-[160px] flex-1 sm:max-w-xs">
                <span className="sr-only">Search purchases</span>
                <input
                  type="search"
                  placeholder="Search PO, GRN, supplier, product…"
                  className="h-8 w-full rounded-lg border-0 bg-white px-2.5 text-xs ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <select
                className="h-8 min-w-[140px] appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900"
                value={view === "late" ? "late" : statusFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "late") {
                    selectView("late");
                    return;
                  }
                  selectStatus(v as StatusFilter);
                }}
                aria-label="Status filter"
              >
                <option value="all">All statuses</option>
                <option value="ORDERED">Ordered</option>
                <option value="late">Overdue</option>
                <option value="RECEIVED">Received</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <select
                className="h-8 min-w-[140px] appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900"
                value={filterSupplierId}
                onChange={(e) => setFilterSupplierId(e.target.value)}
                aria-label="Supplier filter"
              >
                <option value="">All suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-500">
                {rows.length} record{rows.length === 1 ? "" : "s"}
                {view === "late"
                  ? " · overdue"
                  : statusFilter !== "all"
                    ? ` · ${statusFilter.toLowerCase()}`
                    : ""}
              </span>
            </div>

            <div className="overflow-x-auto print:hidden">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Reference", "Supplier", "Items", "Date", "Total", "Status", "Actions"].map(
                      (h) => (
                        <th
                          key={h}
                          className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ${
                            h === "Actions" || h === "Total" ? "text-end" : "text-start"
                          }`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((p) => {
                    const openDays = daysOpen(p.orderedAt || p.createdAt);
                    const late = p.status === "ORDERED" && openDays >= 2;
                    const isReceived = p.status === "RECEIVED";
                    return (
                      <tr
                        key={p.id}
                        className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/70"
                        onClick={() => openDetail(p.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-semibold text-[var(--sf-brand)]">
                            {isReceived ? purchaseRef("GRN", p.id) : purchaseRef("PO", p.id)}
                          </div>
                          {isReceived ? (
                            <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                              from {purchaseRef("PO", p.id)}
                            </div>
                          ) : late ? (
                            <div className="mt-0.5 text-[11px] font-medium text-rose-600">
                              {openDays} days late
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[var(--sf-brand)]">
                            {p.supplier?.name || "No supplier"}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-400">{p.user.name}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <div className="font-medium text-slate-800">
                            {p.lines.length} item{p.lines.length === 1 ? "" : "s"}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-slate-400">
                            {p.lines
                              .slice(0, 2)
                              .map((l) => `${l.product.name} ×${l.qty}`)
                              .join(", ")}
                            {p.lines.length > 2 ? "…" : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatWhen(
                            isReceived
                              ? p.receivedAt || p.createdAt
                              : p.orderedAt || p.createdAt
                          )}
                        </td>
                        <td className="px-4 py-3 text-end font-semibold tabular-nums">
                          {formatKes(p.totalCost)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusTone(p.status)}`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                            {canEdit && p.status === "ORDERED" && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-bold text-[var(--sf-accent-deep)] shadow-sm hover:bg-[var(--sf-accent-soft)]"
                                disabled={busy}
                                onClick={() => {
                                  setActionMenuId(null);
                                  setReceiveId(p.id);
                                }}
                              >
                                Receive
                              </button>
                            )}
                            {((canEdit && p.status === "ORDERED") ||
                              (canEdit && p.status === "CANCELLED")) && (
                              <div className="relative" data-action-menu>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                                  aria-expanded={actionMenuId === p.id}
                                  aria-haspopup="menu"
                                  onClick={() =>
                                    setActionMenuId((id) => (id === p.id ? null : p.id))
                                  }
                                >
                                  More
                                  <svg
                                    className="size-3.5"
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    aria-hidden
                                  >
                                    <path
                                      d="M5 8l5 5 5-5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </button>
                                {actionMenuId === p.id && (
                                  <div
                                    role="menu"
                                    className="absolute end-0 z-30 mt-1.5 w-40 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200"
                                  >
                                    {p.status === "ORDERED" && (
                                      <>
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                                          onClick={() => {
                                            setActionMenuId(null);
                                            openEdit(p);
                                          }}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="flex w-full items-center px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50"
                                          disabled={busy}
                                          onClick={() => {
                                            setActionMenuId(null);
                                            cancelOrder(p.id);
                                          }}
                                        >
                                          Cancel order
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="flex w-full items-center px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50"
                                      disabled={busy}
                                      onClick={() => {
                                        setActionMenuId(null);
                                        askDeletePurchase(p);
                                      }}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            {!(
                              canEdit &&
                              (p.status === "ORDERED" || p.status === "CANCELLED")
                            ) && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                                onClick={() => {
                                  setActionMenuId(null);
                                  openDetail(p.id, true);
                                }}
                              >
                                <svg
                                  className="size-3.5 shrink-0"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  aria-hidden
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                                  />
                                </svg>
                                Print
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!pagedRows.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-14 text-center">
                        <p className="text-sm font-semibold text-[var(--sf-brand)]">Nothing here yet</p>
                        <p className="mt-1 text-xs text-[var(--sf-muted)]">
                          {view === "late"
                            ? "No overdue purchase orders."
                            : statusFilter === "ORDERED" || view === "open"
                              ? "No open orders. Create a purchase and save it as an order."
                              : statusFilter === "RECEIVED" || view === "received"
                                ? "No received stock in this filter."
                                : statusFilter === "CANCELLED"
                                  ? "No cancelled purchases in this filter."
                                  : "Start with a new purchase to add stock or raise a PO."}
                        </p>
                        {canEdit && (
                          <button
                            type="button"
                            className={`${primaryBtn} mt-4`}
                            onClick={() => openNewPurchase(view === "open" ? "po" : "receive")}
                          >
                            + New purchase
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 print:hidden">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  {rows.length
                    ? `Showing ${pageStart} – ${pageEnd} of ${rows.length}`
                    : "Showing 0 of 0"}
                </span>
                <label className="flex items-center gap-1.5 text-xs">
                  Per page
                  <select
                    className="rounded-md border border-slate-200 bg-white px-2 py-1"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
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
                  className="sf-btn sf-btn-sm sf-btn-ghost"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="sf-btn sf-btn-sm sf-btn-ghost"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4 print:hidden">
              <label className="relative min-w-[160px] flex-1 sm:max-w-xs">
                <span className="sr-only">Search suppliers</span>
                <input
                  type="search"
                  placeholder="Search supplier name, phone, email…"
                  className="h-8 w-full rounded-lg border-0 bg-white px-2.5 text-xs ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
                  value={supplierQ}
                  onChange={(e) => setSupplierQ(e.target.value)}
                />
              </label>
              <span className="text-[11px] text-slate-500">
                Click a row to view purchases
              </span>
            </div>

            <div className="overflow-x-auto print:hidden">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Supplier", "Contact", "Purchases", "Spend", "Actions"].map((h) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ${
                          h === "Actions" || h === "Spend" || h === "Purchases"
                            ? "text-end"
                            : "text-start"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplierRows.map((s) => (
                    <tr
                      key={s.id}
                      className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/70"
                      onClick={() => {
                        setTab("purchases");
                        setView("all");
                        setFilterSupplierId(s.id);
                      }}
                    >
                      <td className="px-4 py-3 font-semibold text-[var(--sf-brand)]">{s.name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>{s.phone || "—"}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{s.email || ""}</div>
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">{s.purchaseCount}</td>
                      <td className="px-4 py-3 text-end font-semibold tabular-nums">
                        {formatKes(s.spent)}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {canEdit && (
                          <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              className={outlineAccent}
                              disabled={busy}
                              onClick={() => {
                                setActionMenuId(null);
                                openEditSupplier(s);
                              }}
                            >
                              Edit
                            </button>
                            <div className="relative" data-action-menu>
                              <button
                                type="button"
                                className={outlineAccent}
                                aria-expanded={actionMenuId === `sup-${s.id}`}
                                aria-haspopup="menu"
                                onClick={() =>
                                  setActionMenuId((id) =>
                                    id === `sup-${s.id}` ? null : `sup-${s.id}`
                                  )
                                }
                              >
                                More
                                <svg
                                  className="size-3.5"
                                  viewBox="0 0 20 20"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                  aria-hidden
                                >
                                  <path
                                    d="M5 8l5 5 5-5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </button>
                              {actionMenuId === `sup-${s.id}` && (
                                <div
                                  role="menu"
                                  className="absolute end-0 z-30 mt-1.5 w-40 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full items-center px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50"
                                    disabled={busy}
                                    onClick={() => {
                                      setActionMenuId(null);
                                      askDeleteSupplier(s);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!supplierRows.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-14 text-center">
                        <p className="text-sm font-semibold text-[var(--sf-brand)]">No suppliers yet</p>
                        <p className="mt-1 text-xs text-[var(--sf-muted)]">
                          Add vendors here before assigning them to purchases.
                        </p>
                        {canEdit && (
                          <button
                            type="button"
                            className={`${primaryBtn} mt-4`}
                            onClick={openAddSupplier}
                          >
                            + Add supplier
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {showCompose && canEdit && (
        <div className="sf-modal-backdrop print:hidden">
          <div className="sf-modal max-h-[90vh] max-w-3xl overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {editId ? "Edit purchase order" : "New purchase"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editId
                    ? "Update supplier, note, and lines on this open PO."
                    : "Receive into stock now, or save as a purchase order to receive later."}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
                onClick={() => {
                  setShowCompose(false);
                  resetCompose();
                }}
              >
                ×
              </button>
            </div>

            {error && <p className="sf-alert sf-alert-error mt-3">{error}</p>}

            <div className="mt-4 space-y-3">
              {!editId && (
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs font-semibold">
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 ${
                      composeMode === "receive"
                        ? "bg-white text-[var(--sf-brand)] shadow-sm"
                        : "text-slate-600"
                    }`}
                    onClick={() => setComposeMode("receive")}
                  >
                    Receive now
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 ${
                      composeMode === "po"
                        ? "bg-white text-[var(--sf-brand)] shadow-sm"
                        : "text-slate-600"
                    }`}
                    onClick={() => setComposeMode("po")}
                  >
                    Save as PO
                  </button>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Supplier
                  <select
                    className="sf-select mt-1"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Note / reference
                  <input
                    className="sf-input mt-1"
                    placeholder="Optional"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-2.5">
                  <div className="relative">
                    <input
                      ref={productSearchRef}
                      className="sf-input"
                      placeholder="Search product name, SKU, or barcode — Enter to add"
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setShowProductMenu(true);
                      }}
                      onFocus={() => setShowProductMenu(true)}
                      onBlur={() => setTimeout(() => setShowProductMenu(false), 150)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (productSuggestions[0]) addProduct(productSuggestions[0]);
                        }
                        if (e.key === "Escape") setShowProductMenu(false);
                      }}
                    />
                    {showProductMenu && productSuggestions.length > 0 && (
                      <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                        {productSuggestions.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => addProduct(p)}
                          >
                            <span className="font-semibold text-[var(--sf-brand)]">{p.name}</span>
                            <span className="shrink-0 tabular-nums text-xs text-slate-500">
                              Cost {formatKes(p.cost)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="max-h-[min(42vh,20rem)] overflow-auto">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col />
                      <col className="w-[5.25rem]" />
                      <col className="w-[7rem]" />
                      <col className="w-[7.25rem]" />
                      <col className="w-9" />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="border-b border-slate-100">
                        <th className="px-3 py-2 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Product
                        </th>
                        <th className="px-2 py-2 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Qty
                        </th>
                        <th className="px-2 py-2 text-start text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Unit cost
                        </th>
                        <th className="px-2 py-2 text-end text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Line total
                        </th>
                        <th className="px-1 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <Fragment key={l.key}>
                          <tr className={l.trackSerial && !editId ? "" : "border-b border-slate-50"}>
                            <td className="px-3 py-2 align-middle">
                              <p className="truncate font-semibold text-[var(--sf-brand)]">{l.name}</p>
                              <p className="text-[11px] text-slate-500">
                                {l.unit}
                                {l.trackSerial ? " · serial tracked" : ""}
                              </p>
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <input
                                className="sf-input sf-input-compact"
                                type="number"
                                min="0.01"
                                step="0.5"
                                value={l.qty}
                                onChange={(e) =>
                                  updateLine(l.key, { qty: Number(e.target.value) || 0 })
                                }
                              />
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <input
                                className="sf-input sf-input-compact-wide"
                                type="number"
                                min="0"
                                step="0.01"
                                value={l.unitCost}
                                onChange={(e) =>
                                  updateLine(l.key, { unitCost: Number(e.target.value) || 0 })
                                }
                              />
                            </td>
                            <td className="px-2 py-2 text-end align-middle text-xs font-semibold tabular-nums">
                              {formatKes(l.qty * l.unitCost)}
                            </td>
                            <td className="px-1 py-2 text-end align-middle">
                              <button
                                type="button"
                                className="rounded-md px-1.5 py-1 text-sm font-semibold leading-none text-rose-600 hover:bg-rose-50"
                                aria-label={`Remove ${l.name}`}
                                onClick={() => removeLine(l.key)}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                          {l.trackSerial && !editId ? (
                            <tr className="border-b border-slate-50">
                              <td colSpan={5} className="px-3 pb-2.5 pt-0">
                                <label className="block">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    Serial numbers · {Math.round(l.qty)} required
                                  </span>
                                  <textarea
                                    className="sf-input sf-input-serial mt-1"
                                    rows={2}
                                    placeholder="One serial per line"
                                    value={l.serials}
                                    onChange={(e) => updateLine(l.key, { serials: e.target.value })}
                                  />
                                </label>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                      {!lines.length && (
                        <tr>
                          <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                            Search above to start building this purchase
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-3 py-2.5">
                  <span className="text-xs text-slate-500">
                    {lines.length ? `${lines.length} item${lines.length === 1 ? "" : "s"}` : "No items"}
                  </span>
                  <span className="text-sm font-semibold text-[var(--sf-brand)]">
                    Total{" "}
                    <span className="font-mono tabular-nums">{formatKes(composeTotal)}</span>
                  </span>
                </div>
              </div>

              {!editId && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={recalcSell}
                    onChange={(e) => setRecalcSell(e.target.checked)}
                  />
                  Recalculate sell price from markup on receive
                </label>
              )}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="sf-btn sf-btn-ghost"
                onClick={() => {
                  setShowCompose(false);
                  resetCompose();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sf-btn sf-btn-primary"
                disabled={!lines.length || busy}
                onClick={submitCompose}
              >
                {busy
                  ? "Saving…"
                  : editId
                    ? "Save changes"
                    : composeMode === "po"
                      ? "Create purchase order"
                      : "Receive & generate GRN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSupplierModal && canEdit && (
        <div className="sf-modal-backdrop print:hidden">
          <form
            onSubmit={saveSupplier}
            className="sf-modal max-h-[90vh] max-w-lg overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {editSupplierId ? "Edit supplier" : "Add supplier"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editSupplierId
                    ? "Update this vendor’s name and contact details."
                    : "Add a vendor once, then select them when creating purchases."}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
                onClick={closeSupplierModal}
              >
                ×
              </button>
            </div>

            {error && <p className="sf-alert sf-alert-error mt-3">{error}</p>}

            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Name
                <input
                  className="sf-input mt-1"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  placeholder="e.g. Nairobi Distributors"
                  required
                  autoFocus
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Phone
                  <input
                    className="sf-input mt-1"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    placeholder="Optional"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Email
                  <input
                    className="sf-input mt-1"
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                    placeholder="Optional"
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="sf-btn sf-btn-ghost" onClick={closeSupplierModal}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !supplierForm.name.trim()}
                className="sf-btn sf-btn-primary"
              >
                {busy ? "Saving…" : editSupplierId ? "Save changes" : "Add supplier"}
              </button>
            </div>
          </form>
        </div>
      )}

      {receiveId && (
        <div className="sf-modal-backdrop print:hidden">
          <div className="sf-modal max-w-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Receive purchase order</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Posts stock to the active branch and creates{" "}
                  <span className="font-mono">{purchaseRef("GRN", receiveId)}</span>.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
                onClick={() => setReceiveId(null)}
              >
                ×
              </button>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={recalcSell}
                onChange={(e) => setRecalcSell(e.target.checked)}
              />
              Recalculate sell prices from markup
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="sf-btn sf-btn-ghost" onClick={() => setReceiveId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="sf-btn sf-btn-primary"
                disabled={busy}
                onClick={() => receiveOrder(receiveId)}
              >
                {busy ? "Receiving…" : "Receive & generate GRN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeDetail && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm no-print"
                onClick={() => {
                  setDetailId(null);
                  setPrintOnOpen(false);
                }}
                aria-hidden
              />
              <aside
                className="fixed inset-y-0 right-0 z-[100] flex w-full max-w-lg flex-col border-l border-[var(--sf-border)] bg-white shadow-2xl receipt-print-root"
                role="dialog"
                aria-modal="true"
                aria-label={
                  activeDetail.status === "RECEIVED"
                    ? purchaseRef("GRN", activeDetail.id)
                    : purchaseRef("PO", activeDetail.id)
                }
              >
                {(() => {
                  const slip = purchaseSlipData(activeDetail);
                  const isReceived = activeDetail.status === "RECEIVED";
                  const late =
                    activeDetail.status === "ORDERED" &&
                    daysOpen(activeDetail.orderedAt || activeDetail.createdAt) >= 2;
                  const pill = statusLabel(activeDetail.status, late);
                  return (
                    <>
                      <div className="no-print flex items-center justify-between gap-3 border-b border-[var(--sf-border)] bg-slate-50 px-6 py-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-mono text-lg font-bold text-[var(--sf-brand)]">
                              {slip.reference}
                            </h2>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${pill.tone}`}
                            >
                              {pill.label}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--sf-muted)]">
                            {formatWhen(
                              isReceived
                                ? activeDetail.receivedAt || activeDetail.createdAt
                                : activeDetail.orderedAt || activeDetail.createdAt
                            )}
                            {" · "}
                            {activeDetail.user.name}
                            {activeDetail.supplier?.name
                              ? ` · ${activeDetail.supplier.name}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {canEdit && activeDetail.status === "ORDERED" && (
                            <button
                              type="button"
                              className="rounded-lg border border-[var(--sf-border)] px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              onClick={() => {
                                setDetailId(null);
                                openEdit(activeDetail);
                              }}
                            >
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            title="Print"
                            className="grid size-9 place-items-center rounded-lg border border-[var(--sf-border)] text-slate-600 hover:bg-slate-100"
                            onClick={() => printThermalReceipt("thermal-purchase-slip")}
                          >
                            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            aria-label="Close"
                            onClick={() => {
                              setDetailId(null);
                              setPrintOnOpen(false);
                            }}
                          >
                            <IconClose className="size-5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-100/70">
                        <div className="space-y-6 p-6">
                          <div className="mx-auto max-w-[340px] rounded-lg border border-slate-200 bg-white p-5 font-mono text-xs shadow-sm">
                            <ThermalPurchaseSlip data={slip} />
                          </div>

                          <div className="no-print space-y-2">
                            <button
                              type="button"
                              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white shadow-lg hover:bg-slate-800"
                              onClick={() => printThermalReceipt("thermal-purchase-slip")}
                            >
                              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                              Print thermal slip (80mm)
                            </button>

                            {canEdit && activeDetail.status === "ORDERED" && (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="sf-btn sf-btn-ghost flex-1"
                                  onClick={() => {
                                    setDetailId(null);
                                    setReceiveId(activeDetail.id);
                                  }}
                                >
                                  Receive
                                </button>
                                <button
                                  type="button"
                                  className="sf-btn sf-btn-ghost flex-1 text-rose-600"
                                  onClick={() => askDeletePurchase(activeDetail)}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </aside>
            </>,
            document.body
          )
        : null}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={
          confirmDelete?.kind === "supplier"
            ? `Delete ${confirmDelete.supplier.name}?`
            : confirmDelete?.kind === "purchase"
              ? `Delete ${
                  confirmDelete.purchase.status === "ORDERED"
                    ? purchaseRef("PO", confirmDelete.purchase.id)
                    : "this purchase"
                }?`
              : "Delete?"
        }
        message={
          confirmDelete?.kind === "supplier"
            ? "If they have purchases, they will be deactivated instead so history stays intact."
            : "This cannot be undone."
        }
        confirmLabel="Delete"
        tone="danger"
        loading={busy}
        onCancel={() => {
          if (!busy) setConfirmDelete(null);
        }}
        onConfirm={() => {
          if (!confirmDelete) return;
          if (confirmDelete.kind === "purchase") runDeletePurchase(confirmDelete.purchase);
          else runDeleteSupplier(confirmDelete.supplier);
        }}
      />
    </div>
  );
}
