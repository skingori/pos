"use client";

import { useEffect, useMemo, useState } from "react";
import { clampUnitPrice, formatKes, roundMoney } from "@/lib/money";
import { computeTax } from "@/lib/tax";
import { useSession } from "next-auth/react";
import { canChangePrice, canSellCredit } from "@/lib/permissions";
import { Role } from "@prisma/client";
import Link from "next/link";
import {
  QtyStepper,
  CartPriceInput,
  allowsDecimal,
  decimalStep,
} from "@/components/ui/qty-stepper";
import { ThermalReceipt, type ThermalReceiptData } from "@/components/thermal-receipt";
import { CustomerPicker } from "@/components/customer-picker";
import { SelectMenu } from "@/components/ui/select-menu";
import { downloadReceiptPdf, emailReceipt } from "@/lib/receipt-export";
import { printThermalReceipt } from "@/lib/print-thermal";

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
  /** When true, unitPrice is the final sell price (skip price-level %). */
  priceOverridden?: boolean;
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
  cashierName?: string;
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
const LEGACY_HELD_KEY = "sf:pos:held-sales";
const METHODS: { id: PayMethod; label: string }[] = [
  { id: "CASH", label: "Cash" },
  { id: "MPESA", label: "M-Pesa" },
  { id: "CARD", label: "Card" },
  { id: "BANK", label: "Bank Transfer" },
];

const METHOD_OPTIONS = METHODS.map((m) => ({ value: m.id, label: m.label }));

const DISCOUNT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "5", label: "5% off" },
  { value: "10", label: "10% off" },
  { value: "custom", label: "Custom amount" },
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

function readLegacyHeldSales(): HeldSale[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_HELD_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((h: HeldSale) => h?.cart?.length);
  } catch {
    return [];
  }
}

function clearLegacyHeldSales() {
  try {
    localStorage.removeItem(LEGACY_HELD_KEY);
  } catch {
    /* ignore */
  }
}

function heldAgeLabel(heldAt: number) {
  const mins = Math.floor((Date.now() - heldAt) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
  const [dueDays, setDueDays] = useState(7);

  async function refreshHeldSales() {
    const list = await fetch("/api/held-sales")
      .then((r) => r.json())
      .catch(() => null);
    if (Array.isArray(list)) setHeldSales(list as HeldSale[]);
  }

  async function migrateLegacyHeldSales() {
    const legacy = readLegacyHeldSales();
    if (!legacy.length) return;
    for (const h of legacy) {
      await fetch("/api/held-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: h.label,
          cart: h.cart,
          discount: h.discount,
          discountMode: h.discountMode,
          promoCode: h.promoCode,
          customerId: h.customerId || "",
        }),
      }).catch(() => null);
    }
    clearLegacyHeldSales();
  }

  useEffect(() => {
    setFrequent(loadFrequent());
    (async () => {
      await migrateLegacyHeldSales();
      await refreshHeldSales();
    })();
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
    const refresh = setInterval(() => {
      refreshHeldSales();
    }, 60_000);
    return () => clearInterval(refresh);
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

  function addCustomerToList(c: Customer) {
    setCustomers((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
  }
  const levelOff = selectedCustomer?.priceLevel?.discountPercent || 0;

  function lineUnit(item: CartItem) {
    const raw =
      item.priceOverridden || levelOff <= 0
        ? item.unitPrice
        : roundMoney(item.unitPrice * (1 - levelOff / 100));
    return clampUnitPrice(raw);
  }

  function setLinePrice(productId: string, raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    const price = clampUnitPrice(n);
    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? { ...i, unitPrice: price, priceOverridden: true }
          : i
      )
    );
  }

  const subtotal = roundMoney(cart.reduce((s, i) => s + i.qty * lineUnit(i), 0));

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
        const unit = lineUnit(i);
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
            ...(creditOnAccount > 0
              ? [{ method: "CREDIT", amount: creditOnAccount, mpesaReceipt: null as string | null }]
              : []),
          ]
        : docType === "bill" && !onCredit && !split && appliedStoreCredit > 0
          ? [
              { method: "CREDIT", amount: appliedStoreCredit, mpesaReceipt: null as string | null },
              ...(amountDueNow > 0.01
                ? [
                    {
                      method: payMethod,
                      amount: amountDueNow,
                      mpesaReceipt: null as string | null,
                    },
                  ]
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
  const accountBalance = roundMoney(selectedCustomer?.balance || 0);
  const storeCredit = Math.max(0, -accountBalance);
  const creditOnAccount = onCredit ? roundMoney(Math.max(0, total - depositN)) : 0;
  const storeCreditOnCreditSale = onCredit
    ? roundMoney(Math.min(storeCredit, creditOnAccount))
    : 0;
  const netPutOnAccount = roundMoney(Math.max(0, creditOnAccount - storeCreditOnCreditSale));
  const appliedStoreCredit =
    !onCredit && !split && customerId && storeCredit > 0.009
      ? roundMoney(Math.min(storeCredit, total))
      : 0;
  const amountDueNow = roundMoney(Math.max(0, total - appliedStoreCredit));
  const tendered = Number(cashTendered) || 0;
  const cashPayActive =
    !onCredit && !split && payMethod === "CASH" && amountDueNow > 0.01;
  const cashStatus: "ok" | "missing" | "short" | null = !cashPayActive
    ? null
    : !cashTendered.trim() || tendered <= 0.009
      ? "missing"
      : tendered + 0.01 < amountDueNow
        ? "short"
        : "ok";
  const changeDue =
    cashStatus === "ok" && tendered > amountDueNow
      ? roundMoney(tendered - amountDueNow)
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

  async function holdCurrentSale() {
    if (!cart.length || loading || receipt) return;
    const label =
      (typeof window !== "undefined"
        ? window.prompt("Label this held sale (optional):")
        : null) || undefined;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/held-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label?.trim() || undefined,
          cart,
          discount,
          discountMode,
          promoCode,
          customerId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not hold sale");
        return;
      }
      setHeldSales((prev) => [data as HeldSale, ...prev.filter((h) => h.id !== data.id)]);
      setHeldOpen(true);
      clearCartSale();
    } finally {
      setLoading(false);
    }
  }

  async function restoreHeld(id: string) {
    if (loading) return;
    if (cart.length) {
      const ok =
        typeof window === "undefined" ||
        window.confirm("Replace the current cart with this held sale?");
      if (!ok) return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/held-sales/${id}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not restore held sale");
        await refreshHeldSales();
        return;
      }
      const held = data as HeldSale;
      setHeldSales((prev) => prev.filter((h) => h.id !== id));
      setCart(held.cart || []);
      setDiscount(held.discount || 0);
      setDiscountMode(held.discountMode || "none");
      setPromoCode(held.promoCode || "");
      setPromoMsg(held.promoCode ? `Restored promo ${held.promoCode}` : "");
      setCustomerId(held.customerId || "");
    } finally {
      setLoading(false);
    }
  }

  async function discardHeld(id: string) {
    setHeldSales((prev) => prev.filter((h) => h.id !== id));
    const res = await fetch(`/api/held-sales/${id}`, { method: "DELETE" });
    if (!res.ok) await refreshHeldSales();
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
      if (!creditDueAt || Number.isNaN(new Date(`${creditDueAt}T12:00:00`).getTime())) {
        setError("Set a valid credit due date.");
        return null;
      }
      if (depositN > total + 0.01) {
        setError("Deposit cannot exceed total");
        return null;
      }
      const out: { method: PayMethod; amount: number; phone?: string }[] = [];
      if (depositN > 0) {
        out.push({
          method: depositMethod,
          amount: depositN,
          phone:
            depositMethod === "MPESA" && mpesaPhone.trim()
              ? mpesaPhone.trim()
              : undefined,
        });
      }
      if (creditOnAccount > 0.01) out.push({ method: "CREDIT", amount: creditOnAccount });
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
          phone:
            s.method === "MPESA" && mpesaPhone.trim() ? mpesaPhone.trim() : undefined,
        }))
        .filter((s) => s.amount > 0);
      if (lines.length < 2) {
        setError("Enter at least two amounts, or turn split off to take one payment.");
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

    const out: { method: PayMethod; amount: number; phone?: string }[] = [];
    if (appliedStoreCredit > 0.01) {
      out.push({ method: "CREDIT", amount: appliedStoreCredit });
    }
    if (amountDueNow > 0.01) {
      if (payMethod === "CASH") {
        if (!cashTendered.trim() || tendered <= 0.009) {
          setError(`Enter cash tendered. Need ${formatKes(amountDueNow)}.`);
          return null;
        }
        if (tendered + 0.01 < amountDueNow) {
          setError(
            `Cash short. Tendered ${formatKes(tendered)}, need ${formatKes(amountDueNow)}.`
          );
          return null;
        }
      }
      out.push({
        method: payMethod,
        amount: payMethod === "CASH" ? tendered : amountDueNow,
        phone:
          payMethod === "MPESA" && mpesaPhone.trim() ? mpesaPhone.trim() : undefined,
      });
    }
    if (!out.length) {
      setError("Nothing to charge");
      return null;
    }
    return out;
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
    try {
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
            unitPrice: canDiscount ? lineUnit(c) : undefined,
            serials: c.trackSerial ? c.serials : undefined,
          })),
          payments,
        }),
      });
      const raw = await res.text();
      let data: CompletedSale & { error?: string; stkPending?: boolean } = {} as CompletedSale;
      try {
        data = raw ? JSON.parse(raw) : ({} as CompletedSale);
      } catch {
        setError(res.ok ? "Invalid server response" : "Sale failed");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Sale failed");
        return;
      }
      if (data.stkPending) {
        setError("Waiting for M-Pesa...");
        const confirm = await fetch(`/api/sales/${data.id}/confirm-mpesa`, {
          method: "POST",
        });
        const confirmRaw = await confirm.text();
        let confirmed: CompletedSale & { error?: string } = {} as CompletedSale;
        try {
          confirmed = confirmRaw ? JSON.parse(confirmRaw) : ({} as CompletedSale);
        } catch {
          setError("M-Pesa confirmation failed");
          return;
        }
        if (!confirm.ok) {
          setError(confirmed.error || "M-Pesa not confirmed");
          return;
        }
        finishSale({
          ...confirmed,
          changeDue: data.changeDue,
          cashTendered: data.cashTendered,
        });
        return;
      }
      finishSale(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sale failed");
    } finally {
      setLoading(false);
    }
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
  const cashBlocksComplete = cashStatus === "missing" || cashStatus === "short";
  const discountPct = discountMode === "5" ? 5 : discountMode === "10" ? 10 : 0;
  const dueDateParsed = creditDueAt ? new Date(`${creditDueAt}T12:00:00`) : null;
  const dueDateValid = Boolean(dueDateParsed && !Number.isNaN(dueDateParsed.getTime()));
  const dueLabel = dueDateValid
    ? dueDateParsed!.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Pick a date";
  const balanceAfterCreditSale = roundMoney(accountBalance + creditOnAccount);
  const balanceAfterPayNow = roundMoney(accountBalance + appliedStoreCredit);
  const methodLabel = METHODS.find((m) => m.id === payMethod)?.label || payMethod;
  const depositMethodLabel =
    METHODS.find((m) => m.id === depositMethod)?.label || depositMethod;

  let creditChargeLabel = `Record credit · ${formatKes(netPutOnAccount)} on account`;
  if (depositN > 0.01 && netPutOnAccount > 0.01) {
    creditChargeLabel = `Deposit ${formatKes(depositN)} · on account ${formatKes(netPutOnAccount)}`;
  } else if (depositN > 0.01 && netPutOnAccount <= 0.01) {
    creditChargeLabel = `Charge deposit ${formatKes(depositN)} · ${depositMethodLabel}`;
  } else if (netPutOnAccount <= 0.01 && storeCreditOnCreditSale > 0.01) {
    creditChargeLabel = `Record sale · covered by store credit`;
  } else if (netPutOnAccount <= 0.01) {
    creditChargeLabel = `Record credit sale · ${formatKes(total)}`;
  }

  const chargeLabel = loading
    ? "Processing…"
    : disabledSell
      ? "Open till to sell"
      : cart.length === 0
        ? "Add items to charge"
        : onCredit
          ? !customerId
            ? "Select a customer for credit"
            : !dueDateValid
              ? "Set a credit due date"
              : creditChargeLabel
          : cashStatus === "missing"
            ? `Enter cash tendered · need ${formatKes(amountDueNow)}`
            : cashStatus === "short"
              ? `Cash short · need ${formatKes(amountDueNow)}`
              : appliedStoreCredit > 0.01 && amountDueNow <= 0.01
                ? `Apply store credit · ${formatKes(total)}`
                : appliedStoreCredit > 0.01
                  ? `Charge ${formatKes(amountDueNow)} · Credit + ${methodLabel}`
                  : `Charge ${formatKes(amountDueNow)} · ${methodLabel}`;

  function formatAccountLine(balance: number): { label: string; value: string } {
    if (balance > 0.009) {
      return { label: "Balance owing", value: formatKes(balance) };
    }
    if (balance < -0.009) {
      return { label: "Store credit available", value: formatKes(Math.abs(balance)) };
    }
    return { label: "Account balance", value: formatKes(0) };
  }

  function formatAfterSaleLine(balance: number): { label: string; value: string } {
    if (balance > 0.009) {
      return { label: "Balance after sale", value: formatKes(balance) };
    }
    if (balance < -0.009) {
      return { label: "Store credit remaining", value: formatKes(Math.abs(balance)) };
    }
    return { label: "Account after sale", value: formatKes(0) };
  }

  const accountNow = formatAccountLine(accountBalance);
  const accountAfterOnCredit = formatAfterSaleLine(balanceAfterCreditSale);
  const accountAfterPayNow = formatAfterSaleLine(balanceAfterPayNow);
  const creditBlocksComplete = onCredit && (!customerId || !dueDateValid);
  const canComplete =
    cart.length > 0 &&
    !disabledSell &&
    !loading &&
    !cashBlocksComplete &&
    !creditBlocksComplete;

  function pickDueDays(days: number) {
    setDueDays(days);
    setCreditDueAt(ymdPlus(days));
  }

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

      <div className="flex flex-wrap items-start gap-4">
        {/* LEFT: search, products, cart */}
        <section className="flex min-w-0 flex-[999_1_640px] flex-col gap-3.5">
          <div className="flex gap-2">
            <div className="sf-pos-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <label htmlFor="pos-search" className="sr-only">
                Search products
              </label>
              <input
                id="pos-search"
                type="text"
                placeholder="Scan barcode or search SKU, name, category"
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
            </div>
            <button
              type="button"
              className="sf-pos-add shrink-0"
              disabled={disabledSell || !q.trim()}
              onClick={addFromSearch}
            >
              + Add
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-0.5">
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

          <div className="flex flex-col gap-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--sf-muted)]">
              {cat === "frequent" && !q.trim()
                ? "Frequent items · tap to add"
                : "Products · tap to add"}
            </span>
            {cat === "frequent" && !q.trim() && !filtered.length ? (
              <p className="rounded-lg border border-[var(--sf-border)] bg-white px-3 py-5 text-center text-xs text-[var(--sf-muted)]">
                No frequently sold products yet. Products you sell will appear here.
              </p>
            ) : !filtered.length ? (
              <p className="rounded-lg border border-[var(--sf-border)] bg-white px-3 py-5 text-center text-xs text-[var(--sf-muted)]">
                {cat !== "all" && cat !== "frequent" && !q.trim()
                  ? "No products in this category."
                  : "No products found. Try a different search term."}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
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
                            {h.cashierName ? ` · ${h.cashierName}` : ""}
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
            <div className="flex items-center justify-between gap-2 border-b border-[#ECE9E2] px-3 py-2">
              <div className="flex flex-col gap-0.5">
                <h2 className="sf-display text-sm font-bold text-[var(--sf-brand)]">Cart</h2>
                <p className="text-[11px] text-[var(--sf-muted)]">
                  {cart.length} item(s) · edit price or quantity inline
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-[var(--sf-border)] bg-white px-2.5 text-[11px] font-semibold text-[var(--sf-brand)] disabled:opacity-40"
                title="Hold sale (F3)"
                disabled={!cart.length || loading}
                onClick={holdCurrentSale}
              >
                <IconPause className="h-3.5 w-3.5" />
                Hold sale
              </button>
            </div>
            <ul className="max-h-[min(420px,50vh)] overflow-y-auto">
              {!cart.length ? (
                <li className="px-3 py-5 text-center text-xs text-[var(--sf-muted)]">
                  Cart is empty. Scan an item or tap a frequent item above.
                </li>
              ) : (
                cart.map((item) => {
                  const unit = lineUnit(item);
                  const lineTotal = roundMoney(unit * item.qty);
                  const listPrice =
                    products.find((p) => p.id === item.productId)?.sellPrice ?? item.unitPrice;
                  const belowList = item.priceOverridden && listPrice - unit > 0.004;
                  const code = productCode(item.name, item.productId);
                  const tone = productTileTone(item.productId || item.name);
                  return (
                    <li
                      key={item.productId}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#ECE9E2] px-3 py-2 last:border-b-0"
                    >
                      <div className="flex min-w-[180px] flex-[1_1_180px] items-center gap-2">
                        <span
                          className="sf-display grid size-8 shrink-0 place-items-center rounded-md text-[11px] font-bold"
                          style={{ background: tone.tint, color: tone.ink }}
                        >
                          {code}
                        </span>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-xs font-semibold">{item.name}</span>
                          <span className="text-[11px] text-[var(--sf-muted)]">
                            List {formatKes(listPrice)} / {item.unit}
                          </span>
                          {belowList && (
                            <span className="w-fit rounded bg-[#FFF4D6] px-1.5 py-0.5 text-[10px] font-semibold text-[#7A4B00]">
                              Price changed · {formatKes(listPrice - unit)} below list
                            </span>
                          )}
                          {item.trackSerial && item.serials.length > 0 && (
                            <span className="font-mono text-[10px] text-[var(--sf-muted)]">
                              S/N {item.serials.join(", ")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-semibold text-[var(--sf-muted)]">
                          Unit price
                        </label>
                        {canDiscount ? (
                          <CartPriceInput
                            value={unit}
                            label={`Price for ${item.name}`}
                            onChange={(price) => setLinePrice(item.productId, String(price))}
                          />
                        ) : (
                          <div className="flex h-8 w-[7.75rem] items-center gap-1 rounded-md border-[1.5px] border-[var(--sf-border-strong)] bg-white px-2 text-xs font-semibold tabular-nums">
                            <span className="text-[11px] text-[var(--sf-muted)]">KSh</span>
                            <span className="flex-1 text-right">{unit.toFixed(2)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold text-[var(--sf-muted)]">
                          Quantity ({item.unit})
                        </span>
                        {item.trackSerial ? (
                          <span className="inline-flex h-8 min-w-[6.5rem] items-center justify-center rounded-md border-[1.5px] border-[var(--sf-border-strong)] bg-white px-2.5 text-xs font-bold tabular-nums">
                            {item.qty}
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
                      </div>

                      <div className="flex min-w-[88px] max-w-[140px] flex-[1_1_88px] flex-col items-end gap-0.5">
                        <span className="text-[10px] font-semibold text-[var(--sf-muted)]">
                          Line total
                        </span>
                        <span className="sf-money sf-money-md">{formatKes(lineTotal)}</span>
                      </div>

                      <button
                        type="button"
                        className="grid size-8 place-items-center rounded-md border border-[#F0B4AE] bg-[#FEF1F0] text-[#B42318]"
                        aria-label={`Remove ${item.name}`}
                        title="Remove"
                        onClick={() =>
                          setCart((prev) => prev.filter((i) => i.productId !== item.productId))
                        }
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </section>

        {/* RIGHT: totals → discount → payment */}
        <aside className="flex w-full min-w-0 max-w-[460px] flex-[1_1_320px] flex-col gap-3 xl:sticky xl:top-20">
          <div className="sf-pos-panel flex min-w-0 flex-col gap-1.5 overflow-hidden p-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="sf-display text-sm font-bold">Totals</h3>
              <span className="shrink-0 text-[10px] text-[var(--sf-muted)]">
                Prices include {settings?.vatPercent ?? 16}% VAT
              </span>
            </div>
            <div className="sf-totals-row text-xs text-[#3A4452]">
              <span>Subtotal</span>
              <span className="sf-money">{formatKes(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="sf-totals-row text-xs text-[#166534]">
                <span>Discount{discountPct > 0 ? ` (${discountPct}%)` : ""}</span>
                <span className="sf-money">− {formatKes(discount)}</span>
              </div>
            )}
            {levelOff > 0 && (
              <div className="sf-totals-row text-xs text-[#166534]">
                <span>Price level ({levelOff}%)</span>
                <span>applied on lines</span>
              </div>
            )}
            <div className="sf-totals-row text-[11px] text-[var(--sf-muted)]">
              <span>of which VAT {settings?.vatPercent ?? 16}%</span>
              <span className="sf-money">{formatKes(taxInfo.taxAmount)}</span>
            </div>
            <div className="h-px bg-[#ECE9E2]" />
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="sf-display text-sm font-bold">Total</span>
              <span className="sf-money sf-money-lg">{formatKes(total)}</span>
            </div>
          </div>

          <div className="sf-pos-panel flex flex-col gap-2.5 p-3">
            <div className="flex flex-wrap gap-2.5">
              <SelectMenu
                id="pos-disc"
                className="min-w-[120px] flex-1"
                label="Discount"
                value={discountMode}
                disabled={!canDiscount}
                options={DISCOUNT_OPTIONS}
                onChange={(v) => setDiscountMode(v as "none" | "5" | "10" | "custom")}
              />
              <div className="flex min-w-[180px] flex-[2] flex-col gap-0.5">
                <label htmlFor="pos-promo" className="text-[11px] font-semibold text-[var(--sf-muted)]">
                  Promo code
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="pos-promo"
                    className="h-8 min-w-0 flex-1 rounded-md border-[1.5px] border-[var(--sf-border-strong)] px-2 text-xs"
                    placeholder="Enter code"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value);
                      setPromoMsg("");
                    }}
                  />
                  <button
                    type="button"
                    className="h-8 rounded-md border border-[var(--sf-border)] bg-white px-2.5 text-[11px] font-semibold"
                    disabled={!promoCode.trim()}
                    onClick={applyPromo}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
            {discountMode === "custom" && canDiscount && (
              <input
                type="number"
                className="sf-input"
                placeholder="Custom discount KSh"
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              />
            )}
            {promoMsg && <p className="text-xs text-[var(--sf-muted)]">{promoMsg}</p>}
            {!canDiscount && (
              <p className="text-[11px] text-[var(--sf-muted)]">Only managers can set order discounts.</p>
            )}
          </div>

          <div className="sf-pos-panel flex flex-col gap-2.5 p-3">
            <h3 className="sf-display text-sm font-bold">Payment</h3>

            <div className="sf-pos-seg">
              <button
                type="button"
                data-on={!onCredit ? "true" : "false"}
                onClick={() => {
                  setOnCredit(false);
                }}
              >
                Pay now
              </button>
              {canCredit && (
                <button
                  type="button"
                  data-on={onCredit ? "true" : "false"}
                  onClick={() => {
                    setOnCredit(true);
                    setSplit(false);
                  }}
                >
                  On credit
                </button>
              )}
            </div>

            {onCredit ? (
              <div className="flex flex-col gap-2.5">
                <CustomerPicker
                  customers={customers}
                  value={customerId}
                  onChange={setCustomerId}
                  onCreated={addCustomerToList}
                  label="Customer"
                  emptyLabel="Select customer"
                  allowEmpty
                />
                <div className="flex flex-col gap-1 rounded-lg bg-[var(--sf-surface-2)] px-3 py-2 text-xs">
                  <div className="flex justify-between gap-3 text-[#3A4452]">
                    <span>{accountNow.label}</span>
                    <span className="tabular-nums">{accountNow.value}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-[#3A4452]">
                    <span>This sale total</span>
                    <span className="tabular-nums">{formatKes(total)}</span>
                  </div>
                  {storeCreditOnCreditSale > 0.009 && (
                    <div className="flex justify-between gap-3 text-[#3A4452]">
                      <span>Store credit applied</span>
                      <span className="tabular-nums">− {formatKes(storeCreditOnCreditSale)}</span>
                    </div>
                  )}
                  {depositN > 0.009 && (
                    <div className="flex justify-between gap-3 text-[#3A4452]">
                      <span>Deposit now</span>
                      <span className="tabular-nums">− {formatKes(depositN)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 text-[#3A4452]">
                    <span>Put on account</span>
                    <span className="tabular-nums">{formatKes(netPutOnAccount)}</span>
                  </div>
                  <div className="h-px bg-[var(--sf-border)]" />
                  <div className="flex justify-between gap-3 font-bold">
                    <span>{accountAfterOnCredit.label}</span>
                    <span className="tabular-nums">{accountAfterOnCredit.value}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold text-[var(--sf-muted)]">
                    Due date · {dueLabel}
                  </span>
                  <div className="flex gap-1.5">
                    {[7, 14, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        className="sf-pos-pill"
                        data-on={dueDays === d ? "true" : "false"}
                        onClick={() => pickDueDays(d)}
                      >
                        {d} days
                      </button>
                    ))}
                  </div>
                  <input
                    type="date"
                    className="sf-input"
                    value={creditDueAt}
                    onChange={(e) => {
                      setCreditDueAt(e.target.value);
                      setDueDays(0);
                    }}
                  />
                </div>
                <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2">
                  <SelectMenu
                    label="Deposit method"
                    value={depositMethod}
                    options={METHOD_OPTIONS}
                    onChange={(v) => setDepositMethod(v as PayMethod)}
                  />
                  <div>
                    <label
                      htmlFor="pos-deposit-amt"
                      className="text-[11px] font-semibold text-[var(--sf-muted)]"
                    >
                      Deposit now{" "}
                      <span className="font-normal">(optional)</span>
                    </label>
                    <input
                      id="pos-deposit-amt"
                      className="mt-1 h-8 w-full rounded-md border-[1.5px] border-[var(--sf-border-strong)] bg-white px-2.5 text-xs outline-none focus:border-[var(--sf-accent)] focus:shadow-[0_0_0_3px_var(--sf-accent-soft)]"
                      inputMode="decimal"
                      placeholder="0"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                    />
                  </div>
                </div>
                {depositMethod === "MPESA" && Number(depositAmount) > 0 && (
                  <label className="block text-xs">
                    M-Pesa phone
                    <input
                      className="sf-input mt-1"
                      placeholder="07xxxxxxxx — leave blank for till payment"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                    />
                  </label>
                )}
              </div>
            ) : split ? (
              <div className="mt-1 space-y-2">
                <CustomerPicker
                  customers={customers}
                  value={customerId}
                  onChange={setCustomerId}
                  onCreated={addCustomerToList}
                  label="Customer (optional)"
                  emptyLabel="Walk-in"
                  allowEmpty
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-[var(--sf-muted)]">
                    Amount per method must equal total. Enter at least two amounts.
                  </p>
                  <button
                    type="button"
                    className="shrink-0 text-[11px] font-semibold text-[var(--sf-muted)] underline-offset-2 hover:underline"
                    onClick={() => setSplit(false)}
                  >
                    Single method
                  </button>
                </div>
                {splits.map((line, idx) => (
                  <div key={idx} className="flex items-end gap-2">
                    <SelectMenu
                      className="min-w-0 flex-1"
                      label={`Payment ${idx + 1} method`}
                      value={line.method}
                      options={METHOD_OPTIONS}
                      onChange={(v) =>
                        setSplits((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, method: v as PayMethod } : s))
                        )
                      }
                    />
                    <label className="w-28 text-xs">
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
                  <label className="block text-xs">
                    M-Pesa phone
                    <span className="ml-1 font-normal text-slate-500">(optional)</span>
                    <input
                      className="sf-input mt-1"
                      placeholder="07xxxxxxxx — leave blank for till payment"
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
              <div className="flex flex-col gap-2">
                <CustomerPicker
                  customers={customers}
                  value={customerId}
                  onChange={setCustomerId}
                  onCreated={addCustomerToList}
                  label="Customer (optional)"
                  emptyLabel="Walk-in"
                  allowEmpty
                />
                {customerId && storeCredit > 0.009 && (
                  <div className="flex flex-col gap-1 rounded-lg bg-[#E7F5EC] px-3 py-2 text-xs text-[#14532D]">
                    <div className="flex justify-between gap-3">
                      <span>Store credit available</span>
                      <span className="tabular-nums font-semibold">{formatKes(storeCredit)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Applied to this sale</span>
                      <span className="tabular-nums font-semibold">
                        − {formatKes(appliedStoreCredit)}
                      </span>
                    </div>
                    <div className="h-px bg-[#B7DFC4]" />
                    <div className="flex justify-between gap-3 font-bold">
                      <span>Collect now</span>
                      <span className="tabular-nums">{formatKes(amountDueNow)}</span>
                    </div>
                    {appliedStoreCredit > 0.009 && (
                      <div className="flex justify-between gap-3 text-[11px] text-[#166534]">
                        <span>{accountAfterPayNow.label}</span>
                        <span className="tabular-nums">{accountAfterPayNow.value}</span>
                      </div>
                    )}
                  </div>
                )}
                {amountDueNow > 0.01 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold text-[var(--sf-muted)]">Method</span>
                    <div className="flex gap-1.5">
                      {METHODS.filter((m) => m.id !== "BANK").map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="sf-pos-pill"
                          data-on={payMethod === m.id ? "true" : "false"}
                          onClick={() => {
                            setPayMethod(m.id);
                            setSplit(false);
                          }}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {amountDueNow > 0.01 && payMethod === "CASH" && (
                  <label className="block text-xs">
                    Cash tendered
                    <input
                      className="sf-input mt-1"
                      inputMode="decimal"
                      placeholder={String(amountDueNow || 0)}
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                    />
                  </label>
                )}
                {amountDueNow > 0.01 && payMethod === "MPESA" && (
                  <label className="block text-xs">
                    M-Pesa phone
                    <span className="ml-1 font-normal text-[var(--sf-muted)]">(optional)</span>
                    <input
                      className="sf-input mt-1"
                      placeholder="07xxxxxxxx — leave blank for till payment"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                    />
                  </label>
                )}
                {changeDue > 0 && (
                  <p className="rounded-lg bg-[#E7F5EC] px-2.5 py-1.5 text-xs font-medium text-[#14532D]">
                    Change due: {formatKes(changeDue)}
                  </p>
                )}
                <button
                  type="button"
                  className="text-left text-[11px] font-semibold text-[var(--sf-muted)] underline-offset-2 hover:underline"
                  onClick={() => {
                    setSplit(true);
                    setOnCredit(false);
                  }}
                >
                  Split across methods
                </button>
              </div>
            )}

            {error && <p className="sf-alert sf-alert-error">{error}</p>}

            <button
              type="button"
              disabled={!canComplete}
              onClick={checkout}
              className="sf-pos-charge"
            >
              {chargeLabel}
            </button>
            <button
              type="button"
              className="h-8 rounded-md border border-[var(--sf-border)] bg-white text-[11px] font-semibold text-[var(--sf-brand)] disabled:opacity-40"
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
                onClick={() => printThermalReceipt()}
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
                onClick={() => printThermalReceipt()}
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

const PRODUCT_TILE_TONES = [
  { tint: "#EFE9FB", ink: "#4C2A8A" },
  { tint: "#DDF3EE", ink: "#0F5E50" },
  { tint: "#FBF0D2", ink: "#7A4B00" },
  { tint: "#FDE8E4", ink: "#9A3412" },
  { tint: "#E7F0FB", ink: "#1E3A8A" },
  { tint: "#E8F5E9", ink: "#14532D" },
  { tint: "#F3E8FF", ink: "#6B21A8" },
  { tint: "#ECFDF5", ink: "#065F46" },
] as const;

function productTileTone(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % PRODUCT_TILE_TONES.length;
  return PRODUCT_TILE_TONES[h];
}

function productCode(name: string, seed?: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  const base = (seed || name).replace(/[^a-zA-Z0-9]/g, "");
  return (base.slice(0, 2) || "??").toUpperCase();
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
  const code = productCode(p.name, p.sku || p.id);
  const tone = productTileTone(p.id || p.name);
  return (
    <button
      type="button"
      onClick={() => onAdd(p)}
      disabled={disabled || p.qty <= 0}
      className="flex min-h-[52px] items-center gap-2 rounded-lg border border-[var(--sf-border)] bg-white px-2.5 py-2 text-left text-[var(--sf-brand)] transition hover:border-[var(--sf-border-strong)] hover:bg-[var(--sf-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {p.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.imageUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" />
      ) : (
        <span
          className="sf-display grid size-8 shrink-0 place-items-center rounded-md text-[11px] font-bold"
          style={{ background: tone.tint, color: tone.ink }}
        >
          {code}
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-xs font-semibold">{p.name}</span>
        <span className="text-[11px] text-[var(--sf-muted)]">
          <b className="font-semibold tabular-nums text-[var(--sf-brand)]">{formatKes(p.sellPrice)}</b>
          {" / "}
          {p.unit}
        </span>
      </span>
    </button>
  );
}
