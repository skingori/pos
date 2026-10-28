"use client";

import { useEffect, useMemo, useState } from "react";
import { formatKes, roundMoney } from "@/lib/money";
import { computeTax } from "@/lib/tax";
import { useSession } from "next-auth/react";
import { canChangePrice, canSellCredit } from "@/lib/permissions";
import { Role } from "@prisma/client";
import Link from "next/link";
import { QtyStepper, allowsDecimal, decimalStep } from "@/components/ui/qty-stepper";
import { ThermalReceipt, type ThermalReceiptData } from "@/components/thermal-receipt";
import { downloadReceiptPdf, emailReceipt } from "@/lib/receipt-export";

type PayMethod = "CASH" | "MPESA" | "CARD" | "BANK" | "CREDIT";

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sellPrice: number;
  qty: number;
  unit: string;
  trackSerial?: boolean;
  isReturnSku?: boolean;
  imageUrl?: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
};

type Category = { id: string; name: string };
type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email?: string | null;
  balance: number;
  priceLevel?: { discountPercent: number } | null;
};
type CartItem = {
  productId: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  maxQty: number;
  trackSerial?: boolean;
  serials: string[];
  imageUrl?: string | null;
};

type HeldSale = {
  id: string;
  label: string;
  cart: CartItem[];
  discount: number;
  discountMode: "none" | "5" | "10" | "custom";
  promoCode: string;
  customerId: string;
  heldAt: number;
};
type CompletedSale = {
  id: string;
  receiptNo: number;
  total: number;
  discount: number;
  subtotal: number;
  taxAmount?: number;
  taxRate?: number;
  changeDue?: number;
  cashTendered?: number;
  creditBalanceBefore?: number | null;
  lines: { name: string; qty: number; unitPrice: number; lineTotal: number; unit: string }[];
  payments: { method: string; amount: number; mpesaReceipt?: string | null }[];
  customer?: { name: string } | null;
};
type ShopSettings = {
  vatPercent: number;
  pricesIncludeVat: boolean;
  shopName: string;
  receiptFooter: string;
  address?: string | null;
  phone?: string | null;
  kraPin?: string | null;
};
type Promo = { id: string; name: string; percentOff: number; productId: string | null; active: boolean };
type CatFilter = "frequent" | "all" | string;
type SplitLine = { method: PayMethod; amount: string };

const FREQ_KEY = "sf_pos_frequent";
const HELD_KEY = "sf:pos:held-sales";
const HELD_TTL_MS = 2 * 60 * 60 * 1000;
const HELD_MAX = 10;
const METHODS: { id: PayMethod; label: string }[] = [
  { id: "CASH", label: "Cash" },
  { id: "MPESA", label: "M-Pesa" },
  { id: "CARD", label: "Card" },
  { id: "BANK", label: "Bank Transfer" },
];

function loadFrequent(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FREQ_KEY) || "{}");
  } catch {
    return {};
  }
}

function bumpFrequent(ids: string[]) {
  const map = loadFrequent();
  for (const id of ids) map[id] = (map[id] || 0) + 1;
  localStorage.setItem(FREQ_KEY, JSON.stringify(map));
}

function loadHeldSales(): HeldSale[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HELD_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    return raw.filter((h: HeldSale) => h?.heldAt && now - h.heldAt < HELD_TTL_MS);
  } catch {
    return [];
  }
}

function saveHeldSales(list: HeldSale[]) {
  try {
    localStorage.setItem(HELD_KEY, JSON.stringify(list.slice(0, HELD_MAX)));
  } catch {
    /* ignore quota */
  }
}

function heldAgeLabel(heldAt: number) {
  const mins = Math.floor((Date.now() - heldAt) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function ymdPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function IconPause({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function IconTrash({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function IconPlay({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function Switch({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        data-on={on}
        className="sf-switch"
        onClick={onToggle}
      />
      {label}
    </label>
  );
}

export default function PosPage() {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const canCredit = Boolean(role && canSellCredit(role));
  const canDiscount = Boolean(role && canChangePrice(role));

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [frequent, setFrequent] = useState<Record<string, number>>({});
  const [branchName, setBranchName] = useState("");
  const [tillOpen, setTillOpen] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CatFilter>("frequent");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [discountMode, setDiscountMode] = useState<"none" | "5" | "10" | "custom">("none");
  const [discount, setDiscount] = useState(0);
  const [promoCode, setPromoCode] = useState("");
  const [promoMsg, setPromoMsg] = useState("");
  const [onCredit, setOnCredit] = useState(false);
  const [split, setSplit] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("CASH");
  const [cashTendered, setCashTendered] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [creditDueAt, setCreditDueAt] = useState(ymdPlus(7));
  const [depositMethod, setDepositMethod] = useState<PayMethod>("CASH");
  const [depositAmount, setDepositAmount] = useState("");
  const [splits, setSplits] = useState<SplitLine[]>([
    { method: "CASH", amount: "" },
    { method: "MPESA", amount: "" },
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<CompletedSale | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [heldOpen, setHeldOpen] = useState(true);

  useEffect(() => {
    setFrequent(loadFrequent());
    setHeldSales(loadHeldSales());
    fetch("/api/products").then((r) => r.json()).then((p) => setProducts(Array.isArray(p) ? p : []));
    fetch("/api/categories").then((r) => r.json()).then((c) => setCategories(Array.isArray(c) ? c : []));
    fetch("/api/customers").then((r) => r.json()).then((c) => setCustomers(Array.isArray(c) ? c : []));
    fetch("/api/settings").then((r) => r.json()).then(setSettings);
    fetch("/api/promotions")
      .then((r) => r.json())
      .then((list) => setPromos(Array.isArray(list) ? list.filter((p: Promo) => p.active) : []));
    fetch("/api/cash")
      .then((r) => r.json())
      .then((c) => {
        setTillOpen(Boolean(c?.open));
        if (c?.branch?.name) setBranchName(c.branch.name);
      })
      .catch(() => setTillOpen(null));
  }, []);

  useEffect(() => {
    const prune = setInterval(() => {
      setHeldSales((prev) => {
        const next = prev.filter((h) => Date.now() - h.heldAt < HELD_TTL_MS);
        if (next.length !== prev.length) saveHeldSales(next);
        return next;
      });
    }, 60_000);
    return () => clearInterval(prune);
  }, []);

  const sellable = useMemo(() => products.filter((p) => !p.isReturnSku), [products]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = sellable;
    if (cat === "frequent") {
      list = [...sellable]
        .filter((p) => frequent[p.id])
        .sort((a, b) => (frequent[b.id] || 0) - (frequent[a.id] || 0));
    } else if (cat !== "all") {
      list = sellable.filter((p) => p.categoryId === cat);
    }
    if (term) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.barcode || "").toLowerCase().includes(term) ||
          (p.category?.name || "").toLowerCase().includes(term)
      );
    } else if (cat === "all") {
      list = sellable.slice(0, 48);
    } else {
      list = list.slice(0, 48);
    }
    return list;
  }, [sellable, q, cat, frequent]);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const levelOff = selectedCustomer?.priceLevel?.discountPercent || 0;

  const subtotal = roundMoney(
    cart.reduce((s, i) => {
      const price =
        levelOff > 0 ? roundMoney(i.unitPrice * (1 - levelOff / 100)) : i.unitPrice;
      return s + i.qty * price;
    }, 0)
  );

  useEffect(() => {
    if (discountMode === "none") setDiscount(0);
    else if (discountMode === "5") setDiscount(roundMoney(subtotal * 0.05));
    else if (discountMode === "10") setDiscount(roundMoney(subtotal * 0.1));
  }, [discountMode, subtotal]);

  const afterDiscount = roundMoney(Math.max(0, subtotal - discount));
  const taxInfo = computeTax({
    amountAfterDiscount: afterDiscount,
    vatPercent: settings?.vatPercent || 0,
    pricesIncludeVat: settings?.pricesIncludeVat ?? true,
  });
  const total = taxInfo.total;

  function buildSlipData(docType: "receipt" | "bill", sale?: CompletedSale): ThermalReceiptData {
    const lines =
      sale?.lines ||
      cart.map((i) => {
        const unit =
          levelOff > 0 ? roundMoney(i.unitPrice * (1 - levelOff / 100)) : i.unitPrice;
        return {
          name: i.name,
          qty: i.qty,
          unitPrice: unit,
          lineTotal: roundMoney(unit * i.qty),
          unit: i.unit,
        };
      });
    const billPayments =
      docType === "bill" && onCredit
        ? [
            ...(depositN > 0
              ? [{ method: depositMethod, amount: depositN, mpesaReceipt: null as string | null }]
              : []),
            ...(creditBalance > 0
              ? [{ method: "CREDIT", amount: creditBalance, mpesaReceipt: null as string | null }]
              : []),
          ]
        : [];
    return {
      receiptNo: sale?.receiptNo || 0,
      total: sale?.total ?? total,
      discount: sale?.discount ?? discount,
      subtotal: sale?.subtotal ?? subtotal,
      taxAmount: sale?.taxAmount ?? taxInfo.taxAmount,
      taxRate: sale?.taxRate ?? settings?.vatPercent ?? 0,
      lines,
      payments: sale?.payments || billPayments,
      customer: sale?.customer || (selectedCustomer ? { name: selectedCustomer.name } : null),
      creditBalanceBefore:
        sale?.creditBalanceBefore ??
        (selectedCustomer ? selectedCustomer.balance : null),
      cashier: session?.user?.name,
      completedAt: sale ? new Date().toISOString() : new Date().toISOString(),
      shopName: settings?.shopName || "Kenya Hardware",
      address: settings?.address,
      phone: settings?.phone,
      kraPin: settings?.kraPin,
      receiptFooter: settings?.receiptFooter || "Thank you!",
      docType,
    };
  }

  function promptEmailAndSend(data: ThermalReceiptData) {
    const preset = selectedCustomer?.email || "";
    const to = window.prompt("Send receipt to email:", preset);
    if (to === null) return;
    emailReceipt(data, to.trim());
  }

  const depositN = Number(depositAmount) || 0;
  const creditBalance = onCredit ? roundMoney(Math.max(0, total - depositN)) : 0;
  const tendered = Number(cashTendered) || 0;
  const changeDue =
    !onCredit && !split && payMethod === "CASH" && tendered > total
      ? roundMoney(tendered - total)
      : 0;

  function addProduct(p: Product) {
    if (tillOpen === false) {
      setError("Open the till before selling");
      return;
    }
    if (p.qty <= 0) {
      setError(`${p.name} is out of stock`);
      return;
    }
    let serial: string | undefined;
    if (p.trackSerial) {
      const raw = prompt(`Serial number for ${p.name}`);
      if (!raw?.trim()) return;
      serial = raw.trim();
    }
    setError("");
    const step = p.trackSerial ? 1 : decimalStep(p.unit);
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        if (existing.qty >= p.qty) return prev;
        if (p.trackSerial && serial) {
          if (existing.serials.includes(serial)) {
            setError(`Serial ${serial} already in cart`);
            return prev;
          }
          return prev.map((i) =>
            i.productId === p.id
              ? { ...i, qty: i.qty + 1, serials: [...i.serials, serial!] }
              : i
          );
        }
        const next = Math.round((existing.qty + step) * 100) / 100;
        return prev.map((i) =>
          i.productId === p.id ? { ...i, qty: Math.min(next, p.qty) } : i
        );
      }
      // Start at 1 (or whatever stock is left if under 1) so a full unit is one tap;
      // use the cart stepper for 0.5 / fractional kg & litres.
      const start = Math.min(1, p.qty);
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unit: p.unit,
          qty: start > 0 ? start : step,
          unitPrice: p.sellPrice,
          maxQty: p.qty,
          trackSerial: Boolean(p.trackSerial),
          serials: serial ? [serial] : [],
          imageUrl: p.imageUrl,
        },
      ];
    });
    setQ("");
  }

  function clearCartSale() {
    setCart([]);
    setDiscount(0);
    setDiscountMode("none");
    setPromoCode("");
    setPromoMsg("");
    setCustomerId("");
    setCashTendered("");
    setDepositAmount("");
    setOnCredit(false);
    setSplit(false);
    setPayMethod("CASH");
    setSplits([
      { method: "CASH", amount: "" },
      { method: "MPESA", amount: "" },
    ]);
  }

  function holdCurrentSale() {
    if (!cart.length || loading || receipt) return;
    const label =
      (typeof window !== "undefined"
        ? window.prompt("Label this held sale (optional):")
        : null) || undefined;
    const held: HeldSale = {
      id: crypto.randomUUID(),
      label: label?.trim() || `Sale (${cart.length} items)`,
      cart,
      discount,
      discountMode,
      promoCode,
      customerId,
      heldAt: Date.now(),
    };
    const next = [held, ...heldSales].slice(0, HELD_MAX);
    setHeldSales(next);
    saveHeldSales(next);
    setHeldOpen(true);
    clearCartSale();
    setError("");
  }

  function restoreHeld(id: string) {
    const held = heldSales.find((h) => h.id === id);
    if (!held) return;
    const next = heldSales.filter((h) => h.id !== id);
    setHeldSales(next);
    saveHeldSales(next);
    setCart(held.cart);
    setDiscount(held.discount);
    setDiscountMode(held.discountMode);
    setPromoCode(held.promoCode);
    setPromoMsg(held.promoCode ? `Restored promo ${held.promoCode}` : "");
    setCustomerId(held.customerId);
    setError("");
  }

  function discardHeld(id: string) {
    const next = heldSales.filter((h) => h.id !== id);
    setHeldSales(next);
    saveHeldSales(next);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (receipt || loading || !cart.length) return;
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);
      if (e.key === "F3" && !typing) {
        e.preventDefault();
        holdCurrentSale();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function addFromSearch() {
    const term = q.trim();
    if (!term) return;
    const exact =
      sellable.find((p) => p.barcode === term) ||
      sellable.find((p) => p.sku.toLowerCase() === term.toLowerCase()) ||
      filtered[0];
    if (exact) addProduct(exact);
    else setError("No products found. Try a different search term.");
  }

  function applyPromo() {
    const code = promoCode.trim().toLowerCase();
    if (!code) return;
    const match = promos.find((p) => p.name.toLowerCase() === code);
    if (!match) {
      setPromoMsg("Promo not found");
      return;
    }
    if (!canDiscount) {
      setPromoMsg("Managers apply order promos; product promos still auto-apply");
      return;
    }
    setDiscountMode("custom");
    setDiscount(roundMoney(subtotal * (match.percentOff / 100)));
    setPromoMsg(`Applied ${match.name} (${match.percentOff}% off)`);
  }

  function buildPayments(): { method: PayMethod; amount: number; phone?: string }[] | null {
    if (onCredit) {
      if (!customerId) {
        setError("A credit sale needs a customer so the debt can be collected later.");
        return null;
      }
      if (depositN > total + 0.01) {
        setError("Deposit cannot exceed total");
        return null;
      }
      const out: { method: PayMethod; amount: number; phone?: string }[] = [];
      if (depositN > 0) {
        if (depositMethod === "MPESA" && !mpesaPhone.trim()) {
          setError("Enter M-Pesa phone for the deposit");
          return null;
        }
        out.push({
          method: depositMethod,
          amount: depositN,
          phone: depositMethod === "MPESA" ? mpesaPhone.trim() : undefined,
        });
      }
      if (creditBalance > 0.01) out.push({ method: "CREDIT", amount: creditBalance });
      if (!out.length) {
        setError("Nothing to charge");
        return null;
      }
      return out;
    }

    if (split) {
      const lines = splits
        .map((s) => ({
          method: s.method,
          amount: Number(s.amount) || 0,
          phone: s.method === "MPESA" ? mpesaPhone.trim() : undefined,
        }))
        .filter((s) => s.amount > 0);
      if (lines.length < 2) {
        setError("Enter at least two amounts, or turn split off to take one payment.");
        return null;
      }
      if (lines.some((l) => l.method === "MPESA") && !mpesaPhone.trim()) {
        setError("Enter customer M-Pesa phone");
        return null;
      }
      const nonCash = roundMoney(
        lines.filter((l) => l.method !== "CASH").reduce((s, l) => s + l.amount, 0)
      );
      const cashLine = lines.find((l) => l.method === "CASH");
      const cashAmt = cashLine?.amount || 0;
      if (nonCash - total > 0.01) {
        setError(`Non-cash amounts exceed total (${formatKes(total)})`);
        return null;
      }
      const needCash = roundMoney(total - nonCash);
      if (needCash > 0.01 && cashAmt + 0.01 < needCash) {
        setError(`Amounts must cover total (${formatKes(total)})`);
        return null;
      }
      return lines;
    }

    if (payMethod === "MPESA" && !mpesaPhone.trim()) {
      setError("Enter customer M-Pesa phone");
      return null;
    }
    const amount = payMethod === "CASH" ? Math.max(tendered, total) : total;
    if (payMethod === "CASH" && tendered + 0.01 < total && tendered > 0) {
      setError(`Cash tendered is short of ${formatKes(total)}`);
      return null;
    }
    return [
      {
        method: payMethod,
        amount: payMethod === "CASH" ? (tendered || total) : amount,
        phone: payMethod === "MPESA" ? mpesaPhone.trim() : undefined,
      },
    ];
  }

  async function checkout() {
    setError("");
    if (!cart.length) {
      setError("Cart is empty");
      return;
    }
    const payments = buildPayments();
    if (!payments) return;

    setLoading(true);
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: customerId || null,
        discount,
        creditDueAt: onCredit ? creditDueAt : null,
        lines: cart.map((c) => ({
          productId: c.productId,
          qty: c.qty,
          unitPrice: canDiscount ? c.unitPrice : undefined,
          serials: c.trackSerial ? c.serials : undefined,
        })),
        payments,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Sale failed");
      return;
    }
    if (data.stkPending) {
      setError("Waiting for M-Pesa...");
      const confirm = await fetch(`/api/sales/${data.id}/confirm-mpesa`, { method: "POST" });
      const confirmed = await confirm.json();
      if (!confirm.ok) {
        setError(confirmed.error || "M-Pesa not confirmed");
        return;
      }
      finishSale({ ...confirmed, changeDue: data.changeDue, cashTendered: data.cashTendered });
      return;
    }
    finishSale(data);
  }

  function finishSale(sale: CompletedSale) {
    bumpFrequent(cart.map((c) => c.productId));
    setFrequent(loadFrequent());
    setReceipt(sale);
    clearCartSale();
    setMpesaPhone("");
    setError("");
    fetch("/api/products").then((r) => r.json()).then((p) => setProducts(Array.isArray(p) ? p : []));
    fetch("/api/customers")
      .then((r) => r.json())
      .then((c) => setCustomers(Array.isArray(c) ? c : []));
  }

  const chips: { id: CatFilter; label: string }[] = [
    { id: "frequent", label: "Frequent" },
    { id: "all", label: "All" },
    ...categories.map((c) => ({ id: c.id, label: c.name })),
  ];

  const disabledSell = tillOpen === false;
  const canComplete = cart.length > 0 && !disabledSell && !loading;

  return (
    <div className="space-y-4">
      {tillOpen === false && (
        <div className="sf-alert sf-alert-error flex flex-wrap items-center justify-between gap-2">
          <span>No open drawer at {branchName || "this branch"}.</span>
          <Link href="/cash/open-day" className="sf-btn sf-btn-primary text-xs">
            Open day
          </Link>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* LEFT: search, products, cart */}
        <div className="space-y-3 min-w-0">
          <div className="flex gap-2">
            <input
              className="sf-input flex-1"
              placeholder="SKU, barcode, name, or category..."
              disabled={disabledSell}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (e.target.value.trim() && cat === "frequent") setCat("all");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFromSearch();
                }
              }}
              autoFocus
            />
            <button
              type="button"
              className="sf-btn sf-btn-primary shrink-0 px-4"
              disabled={disabledSell || !q.trim()}
              onClick={addFromSearch}
            >
              + Add
            </button>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`sf-pos-chip ${cat === c.id ? "sf-pos-chip-on" : "sf-pos-chip-off"}`}
                onClick={() => setCat(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="sf-pos-panel p-3">
            {cat === "frequent" && !q.trim() && !filtered.length ? (
              <p className="py-10 text-center text-sm text-slate-500">
                No frequently sold products yet. Products you sell will appear here.
              </p>
            ) : !filtered.length ? (
              <p className="py-10 text-center text-sm text-slate-500">
                {cat !== "all" && cat !== "frequent" && !q.trim()
                  ? "No products in this category."
                  : "No products found. Try a different search term."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((p) => (
                  <ProductTile key={p.id} p={p} onAdd={addProduct} disabled={disabledSell} />
                ))}
              </div>
            )}
          </div>

          {heldSales.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-amber-900"
                onClick={() => setHeldOpen((v) => !v)}
              >
                <span className="inline-flex items-center gap-2">
                  <IconPause className="h-4 w-4" />
                  {heldSales.length} held sale{heldSales.length === 1 ? "" : "s"}
                </span>
                <span className="text-xs text-amber-700">{heldOpen ? "Hide" : "Show"}</span>
              </button>
              {heldOpen && (
                <div className="space-y-2 px-3 pb-3">
                  {heldSales.map((h) => {
                    const total = roundMoney(
                      h.cart.reduce((s, i) => s + i.qty * i.unitPrice, 0) - (h.discount || 0)
                    );
                    return (
                      <div
                        key={h.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--sf-brand)]">{h.label}</p>
                          <p className="text-xs text-slate-500">
                            {h.cart.length} items · {formatKes(Math.max(0, total))} ·{" "}
                            {heldAgeLabel(h.heldAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            className="sf-btn sf-btn-ghost inline-flex h-8 items-center gap-1 px-2 text-xs"
                            onClick={() => restoreHeld(h.id)}
                          >
                            <IconPlay />
                            Restore
                          </button>
                          <button
                            type="button"
                            className="sf-qty-icon text-rose-600"
                            aria-label="Discard held sale"
                            onClick={() => discardHeld(h.id)}
                          >
                            <IconTrash className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="sf-pos-panel overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="font-semibold text-[var(--sf-brand)]">Cart</h2>
                <p className="text-xs text-slate-500">
                  {cart.length} item(s). Remove or change quantity below.
                </p>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  className="sf-btn sf-btn-ghost inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-xs"
                  title="Hold sale (F3)"
                  disabled={loading}
                  onClick={holdCurrentSale}
                >
                  <IconPause />
                  Hold
                </button>
              )}
            </div>
            <ul className="max-h-[280px] space-y-2 overflow-y-auto px-3 py-2">
              {!cart.length ? (
                <li className="py-8 text-center text-sm text-slate-500">Cart is empty.</li>
              ) : (
                cart.map((item) => {
                  const unit =
                    levelOff > 0
                      ? roundMoney(item.unitPrice * (1 - levelOff / 100))
                      : item.unitPrice;
                  const lineTotal = roundMoney(unit * item.qty);
                  const decimal = allowsDecimal(item.unit);
                  const qtyLabel =
                    decimal && item.qty % 1 !== 0 ? item.qty.toFixed(2) : String(item.qty);
                  const initials = item.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase();
                  return (
                    <li
                      key={item.productId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="grid h-full w-full place-items-center text-[10px] font-bold text-[var(--sf-brand)]">
                              {initials}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[var(--sf-brand)]">
                            {item.name}
                          </div>
                          <div className="text-xs text-slate-500 tabular-nums">
                            {decimal ? (
                              <>
                                {qtyLabel} {item.unit} @ {formatKes(unit)}/{item.unit} ={" "}
                                {formatKes(lineTotal)}
                              </>
                            ) : (
                              <>
                                {formatKes(unit)} × {item.qty} = {formatKes(lineTotal)}
                              </>
                            )}
                          </div>
                          {item.trackSerial && item.serials.length > 0 && (
                            <div className="font-mono text-[10px] text-slate-400">
                              S/N {item.serials.join(", ")}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {item.trackSerial ? (
                          <span className="sf-badge bg-slate-50 text-slate-600">
                            {item.qty} {item.unit}
                          </span>
                        ) : (
                          <QtyStepper
                            compact
                            value={item.qty}
                            max={item.maxQty}
                            unit={item.unit}
                            onChange={(qty) =>
                              setCart((prev) =>
                                prev.map((i) =>
                                  i.productId === item.productId ? { ...i, qty } : i
                                )
                              )
                            }
                          />
                        )}
                        <button
                          type="button"
                          className="sf-cart-remove sf-cart-remove-icon"
                          aria-label={`Remove ${item.name}`}
                          title="Remove"
                          onClick={() =>
                            setCart((prev) => prev.filter((i) => i.productId !== item.productId))
                          }
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>

        {/* RIGHT: totals → discount → promo → payment */}
        <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          <div className="sf-pos-panel p-4">
            <h3 className="font-semibold text-[var(--sf-brand)]">Totals</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              VAT {settings?.vatPercent ?? 0}%{" "}
              {settings?.pricesIncludeVat ? "inclusive" : "exclusive"}. Optional discount or promo
              below.
            </p>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal {settings?.pricesIncludeVat ? "(inc VAT)" : ""}</span>
                <span className="tabular-nums">{formatKes(subtotal)}</span>
              </div>
              {levelOff > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Price level</span>
                  <span>-{levelOff}%</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Discount</span>
                  <span className="tabular-nums">-{formatKes(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-500">
                <span>VAT</span>
                <span className="tabular-nums">{formatKes(taxInfo.taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold text-[var(--sf-brand)]">
                <span>Total</span>
                <span className="tabular-nums">{formatKes(total)}</span>
              </div>
            </div>
          </div>

          <div className="sf-pos-panel p-4">
            <h3 className="font-semibold text-[var(--sf-brand)]">Discount</h3>
            <select
              className="sf-input mt-2"
              value={discountMode}
              disabled={!canDiscount}
              onChange={(e) =>
                setDiscountMode(e.target.value as "none" | "5" | "10" | "custom")
              }
            >
              <option value="none">None</option>
              <option value="5">5%</option>
              <option value="10">10%</option>
              <option value="custom">Custom amount</option>
            </select>
            {discountMode === "custom" && canDiscount && (
              <input
                type="number"
                className="sf-input mt-2"
                placeholder="KSh"
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              />
            )}
            {!canDiscount && (
              <p className="mt-1 text-[11px] text-slate-500">Only managers can set order discounts.</p>
            )}
          </div>

          <div className="sf-pos-panel p-4">
            <h3 className="font-semibold text-[var(--sf-brand)]">Promo code</h3>
            <div className="mt-2 flex gap-2">
              <input
                className="sf-input flex-1"
                placeholder="Enter promo code"
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value);
                  setPromoMsg("");
                }}
              />
              <button
                type="button"
                className="sf-btn sf-btn-ghost"
                disabled={!promoCode.trim()}
                onClick={applyPromo}
              >
                Apply
              </button>
            </div>
            {promoMsg && <p className="mt-1 text-xs text-slate-600">{promoMsg}</p>}
          </div>

          <div className="sf-pos-panel p-4">
            <h3 className="font-semibold text-[var(--sf-brand)]">Payment</h3>
            <div className="mt-3 flex flex-wrap gap-4">
              {canCredit && (
                <Switch
                  on={onCredit}
                  label="On credit"
                  onToggle={() => {
                    setOnCredit((v) => !v);
                    setSplit(false);
                  }}
                />
              )}
              {!onCredit && (
                <Switch
                  on={split}
                  label="Split payment"
                  onToggle={() => {
                    setSplit((v) => !v);
                    setOnCredit(false);
                  }}
                />
              )}
            </div>

            {onCredit ? (
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  Customer
                  <select
                    className="sf-input mt-1"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="">Select customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.balance > 0 ? ` — bal ${formatKes(c.balance)}` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedCustomer && (
                    <span className="mt-1 block text-[11px] text-slate-600">
                      Previous balance:{" "}
                      <span className="font-semibold tabular-nums">
                        {formatKes(selectedCustomer.balance)}
                      </span>
                    </span>
                  )}
                  <span className="mt-1 block text-[11px] text-slate-500">
                    A credit sale needs a real customer so the debt can be collected later.
                  </span>
                </label>
                <label className="block text-sm">
                  Due date
                  <input
                    type="date"
                    className="sf-input mt-1"
                    value={creditDueAt}
                    onChange={(e) => setCreditDueAt(e.target.value)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-sm">
                    Deposit method
                    <select
                      className="sf-input mt-1"
                      value={depositMethod}
                      onChange={(e) => setDepositMethod(e.target.value as PayMethod)}
                    >
                      {METHODS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Deposit now (optional)
                    <input
                      className="sf-input mt-1"
                      inputMode="decimal"
                      placeholder="0"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                    />
                  </label>
                </div>
                {depositMethod === "MPESA" && Number(depositAmount) > 0 && (
                  <label className="block text-sm">
                    M-Pesa phone
                    <input
                      className="sf-input mt-1"
                      placeholder="07xxxxxxxx"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                    />
                  </label>
                )}
                <p className="text-sm font-medium text-[var(--sf-brand)]">
                  On credit: {formatKes(creditBalance)}
                </p>
              </div>
            ) : split ? (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-slate-500">
                  Amount per method (must equal total). Enter at least two amounts, or turn split
                  off to take one payment.
                </p>
                {splits.map((line, idx) => (
                  <div key={idx} className="flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-sm">
                      Payment {idx + 1} method
                      <select
                        className="sf-input mt-1"
                        value={line.method}
                        onChange={(e) =>
                          setSplits((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, method: e.target.value as PayMethod } : s
                            )
                          )
                        }
                      >
                        {METHODS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="w-28 text-sm">
                      Amount
                      <input
                        className="sf-input mt-1"
                        inputMode="decimal"
                        placeholder="0"
                        value={line.amount}
                        onChange={(e) =>
                          setSplits((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, amount: e.target.value } : s
                            )
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="sf-btn sf-btn-ghost px-2"
                      disabled={splits.length <= 2}
                      onClick={() => setSplits((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      x
                    </button>
                  </div>
                ))}
                {splits.some((s) => s.method === "MPESA") && (
                  <label className="block text-sm">
                    M-Pesa phone
                    <input
                      className="sf-input mt-1"
                      placeholder="07xxxxxxxx"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                    />
                  </label>
                )}
                {splits.length < 4 && (
                  <button
                    type="button"
                    className="sf-btn sf-btn-ghost w-full text-xs"
                    onClick={() =>
                      setSplits((prev) => [...prev, { method: "CARD", amount: "" }])
                    }
                  >
                    Add payment ({splits.length} of 4)
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  Method
                  <select
                    className="sf-input mt-1"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as PayMethod)}
                  >
                    {METHODS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                {payMethod === "CASH" && (
                  <label className="block text-sm">
                    Cash tendered
                    <input
                      className="sf-input mt-1"
                      inputMode="decimal"
                      placeholder={String(total || 0)}
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                    />
                  </label>
                )}
                {payMethod === "MPESA" && (
                  <label className="block text-sm">
                    M-Pesa phone
                    <input
                      className="sf-input mt-1"
                      placeholder="07xxxxxxxx"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                    />
                  </label>
                )}
                {changeDue > 0 && (
                  <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900">
                    Change due: {formatKes(changeDue)}
                  </p>
                )}
              </div>
            )}

            {/* Customer for price levels when not on credit */}
            {!onCredit && (
              <label className="mt-3 block text-sm">
                Customer (optional)
                <select
                  className="sf-input mt-1"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">Walk-in</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {error && <p className="sf-alert sf-alert-error">{error}</p>}

          <div className="grid gap-2">
            <button
              type="button"
              disabled={!canComplete}
              onClick={checkout}
              className="sf-btn w-full py-3.5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: canComplete ? "var(--sf-brand)" : "#94a3b8",
                color: "#fff",
              }}
            >
              {loading
                ? "Processing..."
                : disabledSell
                  ? "Open till to sell"
                  : cart.length === 0
                    ? "Complete sale"
                    : `Complete sale · ${formatKes(total)}`}
            </button>
            <button
              type="button"
              className="sf-btn sf-btn-ghost w-full"
              disabled={!cart.length || loading}
              title="Print a bill for the customer to review before paying"
              onClick={() => setBillOpen(true)}
            >
              Bill copy
            </button>
          </div>
        </aside>
      </div>

      {billOpen && cart.length > 0 && (
        <div className="sf-modal-backdrop receipt-print-root">
          <div className="sf-modal max-w-sm">
            <div className="no-print mb-3">
              <div className="text-sm font-semibold text-[var(--sf-brand)]">Bill copy</div>
              <p className="text-xs text-slate-500">
                Show the customer what they will pay. This does not complete the sale.
              </p>
            </div>
            <ThermalReceipt data={buildSlipData("bill")} />
            <div className="no-print mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="sf-btn sf-btn-ghost" onClick={() => setBillOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="sf-btn sf-btn-primary"
                onClick={() => window.print()}
              >
                Print
              </button>
              <button
                type="button"
                className="sf-btn sf-btn-ghost"
                onClick={() => promptEmailAndSend(buildSlipData("bill"))}
              >
                Email bill
              </button>
              <button
                type="button"
                className="sf-btn sf-btn-ghost"
                onClick={() => downloadReceiptPdf(buildSlipData("bill"))}
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {receipt && (
        <div className="sf-modal-backdrop receipt-print-root">
          <div className="sf-modal max-w-sm">
            <div className="no-print mb-3 space-y-1">
              <div className="text-sm font-semibold text-[var(--sf-brand)]">Sale complete</div>
              {(receipt.changeDue || 0) > 0 && (
                <div className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900">
                  Give change: {formatKes(receipt.changeDue || 0)}
                </div>
              )}
            </div>
            <ThermalReceipt data={buildSlipData("receipt", receipt)} />
            <div className="no-print mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="sf-btn sf-btn-ghost" onClick={() => setReceipt(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="sf-btn sf-btn-primary"
                onClick={() => window.print()}
              >
                Print
              </button>
              <button
                type="button"
                className="sf-btn sf-btn-ghost"
                onClick={() => promptEmailAndSend(buildSlipData("receipt", receipt))}
              >
                Email receipt
              </button>
              <button
                type="button"
                className="sf-btn sf-btn-ghost"
                onClick={() => downloadReceiptPdf(buildSlipData("receipt", receipt))}
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductTile({
  p,
  onAdd,
  disabled,
}: {
  p: Product;
  onAdd: (p: Product) => void;
  disabled?: boolean;
}) {
  const initials = p.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <button
      type="button"
      onClick={() => onAdd(p)}
      disabled={disabled || p.qty <= 0}
      className="sf-product-tile"
    >
      <div className="flex items-start gap-2">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200" />
        ) : (
          <span className="sf-product-avatar">{initials}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--sf-brand)]">
            {p.name}
          </div>
          <div className="mt-1 text-[13px] font-semibold tabular-nums text-slate-800">
            {formatKes(p.sellPrice)}
            <span className="font-normal text-slate-400">/{p.unit}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
