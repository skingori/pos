"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatKes } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import { hasPermission } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { PaymentReceipt, type PaymentReceiptData } from "@/components/payment-receipt";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  balance: number;
  active: boolean;
  priceLevelId?: string | null;
  priceLevel?: { id: string; name: string; discountPercent: number } | null;
};

type LedgerEntry = {
  id: string;
  at: string;
  type: string;
  label: string;
  ref: string;
  detail: string | null;
  owed: number;
  paid: number;
  balanceAfter: number;
};

type OpenCharge = {
  saleId: string;
  receiptNo: number;
  completedAt: string;
  dueAt: string | null;
  originalCredit: number;
  openAmount: number;
  total: number;
  ageDays: number;
};

type Payment = {
  id: string;
  receiptNo: number;
  amount: number;
  method: string;
  note: string | null;
  isWriteOff: boolean;
  createdAt: string;
  user?: { name: string } | null;
};

type Detail = {
  customer: Customer;
  ledger: LedgerEntry[];
  openCharges: OpenCharge[];
  payments: Payment[];
  summary: {
    balance: number;
    owed: number;
    storeCredit: number;
    creditLimit: number;
    openReceipts: number;
    openDue?: number;
    availableCredit: number | null;
  };
};

type Tab = "statement" | "open" | "payments";

type ShopSettings = {
  shopName: string;
  address?: string | null;
  phone?: string | null;
  kraPin?: string | null;
  receiptFooter?: string | null;
};

function IconUserOff({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 11h-6" />
    </svg>
  );
}

function IconBan({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function IconWallet({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 7h18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7z" />
      <path d="M2 7V5a2 2 0 0 1 2-2h12" />
      <circle cx="17" cy="13.5" r="1.5" />
    </svg>
  );
}

function IconBack({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function IconSearch({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

const LEDGER_PAGE_SIZE = 10;

function TablePager({
  from,
  to,
  total,
  noun,
  page,
  pageCount,
  onPage,
}: {
  from: number;
  to: number;
  total: number;
  noun: string;
  page: number;
  pageCount: number;
  onPage: (n: number) => void;
}) {
  const max = Math.min(pageCount, 5);
  const start = Math.min(Math.max(0, page - 2), Math.max(0, pageCount - max));
  const buttons = Array.from({ length: max }, (_, i) => start + i);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500 sm:px-4">
      <span>
        Showing {from} to {to} of {total} {noun}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          disabled={page <= 0}
          onClick={() => onPage(Math.max(0, page - 1))}
          aria-label="Previous page"
        >
          ‹
        </button>
        {buttons.map((n) => (
          <button
            key={n}
            type="button"
            className={`inline-flex size-8 items-center justify-center rounded-lg border text-xs font-medium ${
              n === page
                ? "border-[var(--sf-brand)] bg-[var(--sf-brand)] text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            onClick={() => onPage(n)}
          >
            {n + 1}
          </button>
        ))}
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
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

function typeBadge(type: string) {
  switch (type) {
    case "CREDIT_SALE":
      return "bg-sky-100 text-sky-800 ring-sky-600/20";
    case "PAYMENT":
      return "bg-emerald-100 text-emerald-800 ring-emerald-600/20";
    case "WRITE_OFF":
      return "bg-amber-100 text-amber-900 ring-amber-600/20";
    case "CREDIT_REFUND":
      return "bg-violet-100 text-violet-800 ring-violet-600/20";
    case "STORE_CREDIT_REVERSAL":
      return "bg-orange-100 text-orange-900 ring-orange-600/20";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-500/20";
  }
}

function dueStatus(dueAt: string | null, openAmount: number) {
  if (openAmount <= 0.009) {
    return {
      label: "Settled",
      className: "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-500/20",
      showClock: false,
    };
  }
  if (!dueAt) {
    return {
      label: "Open",
      className: "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-600/20",
      showClock: false,
    };
  }
  const days = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) {
    return {
      label: `${Math.abs(days)}d overdue`,
      className: "bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-600/20",
      showClock: true,
    };
  }
  if (days === 0) {
    return {
      label: "Due today",
      className: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20",
      showClock: true,
    };
  }
  if (days <= 7) {
    return {
      label: `Due in ${days}d`,
      className: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20",
      showClock: true,
    };
  }
  return {
    label: "Open",
    className: "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-600/20",
    showClock: false,
  };
}

function isDueSoon(dueAt: string | null) {
  if (!dueAt) return false;
  const days = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  return days >= 0 && days <= 7;
}

function methodLabel(method: string) {
  switch (method) {
    case "CASH":
      return "Cash";
    case "MPESA":
      return "Mobile money";
    case "BANK":
      return "Bank transfer";
    case "CARD":
      return "Card";
    default:
      return method;
  }
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Whole shillings only — cents round into the integer (27,100.00 → 27,100). */
function wholeAmount(n: number) {
  const rounded = Math.round(n);
  return rounded.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function signedWhole(n: number) {
  if (Math.abs(n) < 0.5) return "0";
  const rounded = Math.round(n);
  return `${rounded > 0 ? "+" : ""}${wholeAmount(rounded)}`;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdFromIso(iso: string) {
  return ymd(new Date(iso));
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

type StmtDatePreset = "all" | "today" | "week" | "month" | "last_month" | "custom";

function stmtRangeFor(preset: Exclude<StmtDatePreset, "all" | "custom">): { from: string; to: string } {
  const now = new Date();
  const today = ymd(now);
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") return { from: ymd(startOfWeek(now)), to: today };
  if (preset === "month") {
    return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: ymd(first), to: ymd(last) };
}

function formatRangeLabel(from: string, to: string) {
  if (!from && !to) return "All dates";
  const a = from ? new Date(from + "T12:00:00") : null;
  const b = to ? new Date(to + "T12:00:00") : null;
  if (a && b && from === to) {
    return a.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  }
  const left = a
    ? a.toLocaleDateString("en-KE", { day: "numeric", month: "short" })
    : "…";
  const right = b
    ? b.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
    : "…";
  return `${left} – ${right}`;
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function dueChip(detail: string | null) {
  if (!detail) return null;
  const m = detail.match(/due\s+(\d{4}-\d{2}-\d{2})/i);
  if (!m) return null;
  const d = new Date(m[1] + "T12:00:00");
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

function money(n: number) {
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function receiptHrefFromLedger(e: LedgerEntry): string | null {
  if (e.type === "CREDIT_SALE" && e.id.startsWith("sale-")) {
    return `/receipts?saleId=${encodeURIComponent(e.id.slice(5))}`;
  }
  if (e.type === "CREDIT_REFUND") {
    const m = e.ref.match(/#(\d+)/);
    if (m) return `/receipts?q=${encodeURIComponent(m[1])}`;
  }
  return null;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || "");
  const { data: session } = useSession();
  const canPay = hasPermission(session?.user, "customers.access");
  const canWriteOff = hasPermission(session?.user, "receivables.write_off");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("statement");
  const [ledgerFilter, setLedgerFilter] = useState<"ALL" | "CHARGED" | "RECEIVED">("ALL");
  const [ledgerQ, setLedgerQ] = useState("");
  const [ledgerPage, setLedgerPage] = useState(0);
  const [stmtFrom, setStmtFrom] = useState("");
  const [stmtTo, setStmtTo] = useState("");
  const [stmtPreset, setStmtPreset] = useState<StmtDatePreset>("all");
  const [showDateRange, setShowDateRange] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [openQ, setOpenQ] = useState("");
  const [openStatusFilter, setOpenStatusFilter] = useState<"ALL" | "DUE_SOON" | "OPEN">("ALL");
  const [openPage, setOpenPage] = useState(0);
  const [payQ, setPayQ] = useState("");
  const [payMethodFilter, setPayMethodFilter] = useState<"ALL" | "CASH" | "MPESA" | "BANK">("ALL");
  const [payPage, setPayPage] = useState(0);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [showWriteOff, setShowWriteOff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payNote, setPayNote] = useState("");
  const [payRef, setPayRef] = useState("");
  /** Collect debt (allows overpay → store credit) vs top up store credit only. */
  const [payIntent, setPayIntent] = useState<"payment" | "credit">("payment");
  /** null = main Record payment (FIFO all). Set = Pay on one open receipt. */
  const [payTargetSaleId, setPayTargetSaleId] = useState<string | null>(null);
  const [writeAmount, setWriteAmount] = useState("");
  const [writeReason, setWriteReason] = useState("");
  const [receipt, setReceipt] = useState<PaymentReceiptData | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    const [res, s] = await Promise.all([
      fetch(`/api/customers/${id}`),
      fetch("/api/settings").then((r) => r.json()).catch(() => null),
    ]);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to load customer");
      setDetail(null);
      return;
    }
    setDetail(data);
    if (s?.shopName) setSettings(s);
    setPayAmount(data.summary.owed > 0 ? String(data.summary.owed) : "");
    setWriteAmount(data.summary.owed > 0 ? String(data.summary.owed) : "");
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  // Same order the server settles in: targeted receipt first, then the rest oldest first.
  const allocations = useMemo(() => {
    if (!detail) return [];
    let left = Number(payAmount) || 0;
    const target = payTargetSaleId
      ? detail.openCharges.find((ch) => ch.saleId === payTargetSaleId)
      : undefined;
    const ordered = target
      ? [target, ...detail.openCharges.filter((ch) => ch.saleId !== target.saleId)]
      : detail.openCharges;
    return ordered
      .map((ch) => {
        const alloc = round2(Math.min(ch.openAmount, Math.max(0, left)));
        left = round2(left - alloc);
        return { ...ch, allocate: alloc };
      })
      .filter((a) => !target || a.saleId === target.saleId || a.allocate > 0.009);
  }, [detail, payAmount, payTargetSaleId]);

  const payTargetReceipt = useMemo(() => {
    if (!detail || !payTargetSaleId) return null;
    return detail.openCharges.find((ch) => ch.saleId === payTargetSaleId) || null;
  }, [detail, payTargetSaleId]);

  const payStats = useMemo(() => {
    const amount = round2(Number(payAmount) || 0);
    const accountDue = round2(
      (detail?.openCharges || []).reduce((s, ch) => s + ch.openAmount, 0)
    );
    const outstanding = round2(allocations.reduce((s, a) => s + a.openAmount, 0));
    const allocated = round2(allocations.reduce((s, a) => s + a.allocate, 0));
    const storeCredit = round2(Math.max(0, amount - accountDue));
    const stillDue = round2(Math.max(0, accountDue - amount));
    const targetOpen = payTargetReceipt?.openAmount ?? 0;
    const toOthers = payTargetReceipt
      ? round2(Math.max(0, Math.min(amount, accountDue) - targetOpen))
      : 0;
    return { amount, outstanding, allocated, storeCredit, stillDue, toOthers };
  }, [allocations, payAmount, detail, payTargetReceipt]);

  function closePayModal() {
    setShowPay(false);
    setPayTargetSaleId(null);
    setPayIntent("payment");
    setFormError("");
  }

  useEffect(() => {
    if (!showPay) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePayModal();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPay]);

  function openPayAll() {
    if (!detail) return;
    setFormError("");
    setPayIntent("payment");
    setPayTargetSaleId(null);
    setPayMethod("CASH");
    setPayAmount(detail.summary.owed > 0.009 ? String(detail.summary.owed) : "");
    setShowPay(true);
  }

  function openAddCredit() {
    if (!detail) return;
    setFormError("");
    setPayIntent("credit");
    setPayTargetSaleId(null);
    setPayMethod("CASH");
    setPayAmount("");
    setShowPay(true);
  }

  function openPayReceipt(ch: OpenCharge) {
    setFormError("");
    setPayIntent("payment");
    setPayTargetSaleId(ch.saleId);
    setPayMethod("CASH");
    setPayAmount(String(ch.openAmount));
    setShowPay(true);
  }

  function setPayAmountFromInput(raw: string) {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const next =
      parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
    setPayAmount(next);
  }

  function askToggleActive() {
    if (!detail) return;
    setConfirmToggle(true);
  }

  async function runToggleActive() {
    if (!detail) return;
    const next = !detail.customer.active;
    setToggleBusy(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setConfirmToggle(false);
        setError(data.error || "Could not update customer");
        return;
      }
      setConfirmToggle(false);
      load();
    } finally {
      setToggleBusy(false);
    }
  }

  async function submitPayment(e: React.FormEvent, isWriteOff: boolean) {
    e.preventDefault();
    if (!detail || !canPay) return;
    setFormError("");
    const amount = Number(isWriteOff ? writeAmount : payAmount);
    if (!amount || amount <= 0) {
      setFormError("Enter a valid amount");
      return;
    }
    if (isWriteOff && !writeReason.trim()) {
      setFormError("Write-off requires a reason");
      return;
    }
    const noteParts = isWriteOff
      ? [writeReason.trim()]
      : [payRef.trim() ? `Ref: ${payRef.trim()}` : null, payNote.trim() || null].filter(Boolean);
    setSaving(true);
    let res: Response;
    let data: Awaited<ReturnType<Response["json"]>>;
    try {
      res = await fetch("/api/receivables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: id,
          amount,
          method: isWriteOff ? "CASH" : payMethod,
          note: noteParts.length ? noteParts.join(" · ") : null,
          isWriteOff,
          saleId: !isWriteOff && payTargetSaleId ? payTargetSaleId : undefined,
        }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
      return;
    } finally {
      setSaving(false);
    }
    if (!res.ok) {
      setFormError(data.error || "Failed");
      return;
    }
    closePayModal();
    setShowWriteOff(false);
    setPayNote("");
    setPayRef("");
    setWriteReason("");
    setReceipt({
      receiptNo: data.receiptNo,
      amount: data.amount,
      method: data.method,
      note: data.note,
      createdAt: data.createdAt,
      isWriteOff: data.isWriteOff,
      customer: {
        name: data.customer?.name || detail.customer.name,
        phone: data.customer?.phone || detail.customer.phone,
      },
      previousBalance: data.previousBalance,
      appliedToDebt: data.appliedToDebt,
      excessCredit: data.excessCredit,
      newBalance: data.newBalance,
      shopName: settings?.shopName || "Shop",
      address: settings?.address,
      phone: settings?.phone,
      kraPin: settings?.kraPin,
      receiptFooter: settings?.receiptFooter || "Thank you!",
      cashier: session?.user?.name || data.user?.name || null,
    });
    load();
  }

  function reprintPayment(p: Payment) {
    if (!detail) return;
    const lines = detail.ledger.filter(
      (l) => l.ref === `Payment #${p.receiptNo}` || l.ref === `Write-off #${p.receiptNo}`
    );
    const after = lines.length ? lines[lines.length - 1].balanceAfter : detail.summary.balance;
    const before = round2(after + p.amount);
    setReceipt({
      receiptNo: p.receiptNo,
      amount: p.amount,
      method: p.method,
      note: p.note,
      createdAt: p.createdAt,
      isWriteOff: p.isWriteOff,
      customer: { name: detail.customer.name, phone: detail.customer.phone },
      previousBalance: before,
      appliedToDebt: Math.min(Math.max(0, before), p.amount),
      excessCredit: Math.max(0, p.amount - Math.min(Math.max(0, before), p.amount)),
      newBalance: after,
      shopName: settings?.shopName || "Shop",
      address: settings?.address,
      phone: settings?.phone,
      kraPin: settings?.kraPin,
      receiptFooter: settings?.receiptFooter || "Thank you!",
      cashier: p.user?.name || null,
    });
  }

  const accountStats = useMemo(() => {
    if (!detail) return null;
    const balanceSeries = detail.ledger
      .filter((e) => e.type !== "OPENING")
      .map((e) => Math.max(0, e.balanceAfter));

    const collectedTotal = detail.payments.reduce((s, p) => s + p.amount, 0);
    const lastPay = detail.payments[0]?.amount || 0;
    const openDue =
      detail.summary.openDue ??
      detail.openCharges.reduce((s, c) => s + c.openAmount, 0);
    const movements = detail.ledger.filter((e) => e.type !== "OPENING" && e.type !== "CLOSING");
    const opening = detail.ledger.find((e) => e.type === "OPENING");
    const closing = detail.ledger.find((e) => e.type === "CLOSING");
    const chargedTotal = movements.reduce((s, e) => s + e.owed, 0);
    const receivedTotal = movements.reduce((s, e) => s + e.paid, 0);
    const peakBalance = Math.max(
      detail.summary.creditLimit,
      detail.summary.owed,
      ...balanceSeries,
      1
    );
    const firstBal = balanceSeries.length > 1 ? balanceSeries[0] : 0;
    const outstandingDelta = round2(detail.summary.owed - firstBal);
    const now = Date.now();
    let dueSoonCount = 0;
    let dueSoonAmount = 0;
    for (const ch of detail.openCharges) {
      if (!ch.dueAt) continue;
      const due = new Date(ch.dueAt).getTime();
      const days = Math.ceil((due - now) / (24 * 60 * 60 * 1000));
      if (days >= 0 && days <= 7) {
        dueSoonCount += 1;
        dueSoonAmount = round2(dueSoonAmount + ch.openAmount);
      }
    }
    const openSaleTotal = round2(
      detail.openCharges.reduce((s, c) => s + c.originalCredit, 0)
    );
    const openPaidTotal = round2(
      detail.openCharges.reduce((s, c) => s + (c.originalCredit - c.openAmount), 0)
    );
    const lastPaymentAt = detail.payments[0]?.createdAt || null;
    const dates = movements.map((e) => e.at).filter(Boolean) as string[];
    const minAt = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
    const maxAt = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
    const rangeLabel =
      minAt && maxAt
        ? `${new Date(minAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })} – ${new Date(maxAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}`
        : "All dates";
    const limitPct =
      detail.summary.creditLimit > 0
        ? Math.min(100, Math.round((detail.summary.owed / detail.summary.creditLimit) * 1000) / 10)
        : Math.min(100, Math.round((detail.summary.owed / Math.max(peakBalance, 1)) * 100));
    const available =
      detail.summary.availableCredit != null
        ? detail.summary.availableCredit
        : detail.summary.creditLimit > 0
          ? round2(Math.max(0, detail.summary.creditLimit - detail.summary.owed))
          : null;

    return {
      balanceSeries: balanceSeries.length ? balanceSeries : [detail.summary.owed],
      openDue,
      openSaleTotal,
      openPaidTotal,
      collectedTotal,
      lastPay,
      lastPaymentAt,
      peakBalance,
      openingBal: opening?.balanceAfter ?? 0,
      closingBal: closing?.balanceAfter ?? detail.summary.owed,
      chargedTotal,
      receivedTotal,
      outstandingDelta,
      dueSoonCount,
      dueSoonAmount,
      rangeLabel,
      limitPct,
      available,
      statementRows: movements,
      atLimit:
        detail.summary.creditLimit > 0 &&
        detail.summary.owed >= detail.summary.creditLimit - 0.009,
    };
  }, [detail]);

  const statementPaging = useMemo(() => {
    if (!detail) {
      return {
        opening: null as LedgerEntry | null,
        closing: null as LedgerEntry | null,
        movements: [] as LedgerEntry[],
        pageRows: [] as LedgerEntry[],
        dayGroups: [] as { key: string; label: string; net: number; rows: LedgerEntry[] }[],
        pageCount: 1,
        safePage: 0,
        from: 0,
        to: 0,
        total: 0,
        openingBal: 0,
        closingBal: 0,
        chargedTotal: 0,
        receivedTotal: 0,
        rangeLabel: "All dates",
        atLimit: false,
      };
    }
    const opening = detail.ledger.find((e) => e.type === "OPENING") || null;
    const closing = detail.ledger.find((e) => e.type === "CLOSING") || null;
    const allMovements = detail.ledger.filter(
      (e) => e.type !== "OPENING" && e.type !== "CLOSING"
    );
    const term = ledgerQ.trim().toLowerCase();
    const fromYmd = stmtFrom;
    const toYmd = stmtTo;

    let openingBal = opening?.balanceAfter ?? 0;
    if (fromYmd) {
      const before = allMovements.filter((e) => e.at && ymdFromIso(e.at) < fromYmd);
      openingBal = before.length
        ? before[before.length - 1].balanceAfter
        : (opening?.balanceAfter ?? 0);
    }

    const dated = allMovements.filter((e) => {
      if (!e.at) return !fromYmd && !toYmd;
      const d = ymdFromIso(e.at);
      if (fromYmd && d < fromYmd) return false;
      if (toYmd && d > toYmd) return false;
      return true;
    });

    const movements = dated.filter((e) => {
      if (ledgerFilter === "CHARGED" && !(e.owed > 0.009)) return false;
      if (ledgerFilter === "RECEIVED" && !(e.paid > 0.009)) return false;
      if (!term) return true;
      const hay = [
        e.label,
        e.ref,
        e.detail || "",
        e.type,
        e.owed ? money(e.owed) : "",
        e.paid ? money(e.paid) : "",
        e.at ? formatWhen(e.at) : "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });

    const chargedTotal = round2(dated.reduce((s, e) => s + e.owed, 0));
    const receivedTotal = round2(dated.reduce((s, e) => s + e.paid, 0));
    const closingBal = dated.length
      ? dated[dated.length - 1].balanceAfter
      : fromYmd || toYmd
        ? openingBal
        : (closing?.balanceAfter ?? detail.summary.owed);
    const atLimit =
      detail.summary.creditLimit > 0 && closingBal >= detail.summary.creditLimit - 0.009;

    const dataDates = allMovements.map((e) => e.at).filter(Boolean) as string[];
    const dataMin = dataDates.length ? dataDates.reduce((a, b) => (a < b ? a : b)) : null;
    const dataMax = dataDates.length ? dataDates.reduce((a, b) => (a > b ? a : b)) : null;
    const rangeLabel =
      fromYmd || toYmd
        ? formatRangeLabel(fromYmd, toYmd)
        : dataMin && dataMax
          ? formatRangeLabel(ymdFromIso(dataMin), ymdFromIso(dataMax))
          : "All dates";

    const pageCount = Math.max(1, Math.ceil(movements.length / LEDGER_PAGE_SIZE));
    const safePage = Math.min(ledgerPage, pageCount - 1);
    const start = safePage * LEDGER_PAGE_SIZE;
    const pageRows = movements.slice(start, start + LEDGER_PAGE_SIZE);
    const dayGroups: { key: string; label: string; net: number; rows: LedgerEntry[] }[] = [];
    for (const e of pageRows) {
      const key = e.at ? dayKey(e.at) : "unknown";
      const last = dayGroups[dayGroups.length - 1];
      const net = round2(e.owed - e.paid);
      if (last && last.key === key) {
        last.rows.push(e);
        last.net = round2(last.net + net);
      } else {
        dayGroups.push({
          key,
          label: e.at ? dayLabel(e.at) : "Unknown",
          net,
          rows: [e],
        });
      }
    }
    return {
      opening,
      closing,
      movements,
      pageRows,
      dayGroups,
      pageCount,
      safePage,
      from: movements.length ? start + 1 : 0,
      to: Math.min(movements.length, start + LEDGER_PAGE_SIZE),
      total: movements.length,
      openingBal,
      closingBal,
      chargedTotal,
      receivedTotal,
      rangeLabel,
      atLimit,
    };
  }, [detail, ledgerFilter, ledgerQ, ledgerPage, stmtFrom, stmtTo]);

  const openPaging = useMemo(() => {
    const rows = detail?.openCharges || [];
    const term = openQ.trim().toLowerCase();
    const filtered = rows.filter((ch) => {
      if (openStatusFilter === "DUE_SOON" && !isDueSoon(ch.dueAt)) return false;
      if (openStatusFilter === "OPEN" && isDueSoon(ch.dueAt)) return false;
      if (!term) return true;
      const paid = round2(ch.originalCredit - ch.openAmount);
      const hay = [
        `#${ch.receiptNo}`,
        String(ch.receiptNo),
        money(ch.openAmount),
        money(ch.originalCredit),
        paid > 0 ? money(paid) : "",
        ch.dueAt ? new Date(ch.dueAt).toLocaleDateString("en-KE") : "",
        new Date(ch.completedAt).toLocaleDateString("en-KE"),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
    const pageCount = Math.max(1, Math.ceil(filtered.length / LEDGER_PAGE_SIZE));
    const safePage = Math.min(openPage, pageCount - 1);
    const start = safePage * LEDGER_PAGE_SIZE;
    return {
      filtered,
      pageRows: filtered.slice(start, start + LEDGER_PAGE_SIZE),
      pageCount,
      safePage,
      from: filtered.length ? start + 1 : 0,
      to: Math.min(filtered.length, start + LEDGER_PAGE_SIZE),
      total: filtered.length,
    };
  }, [detail, openQ, openPage, openStatusFilter]);

  const payPaging = useMemo(() => {
    const rows = detail?.payments || [];
    const term = payQ.trim().toLowerCase();
    const filtered = rows.filter((p) => {
      if (payMethodFilter !== "ALL" && !p.isWriteOff && p.method !== payMethodFilter) return false;
      if (payMethodFilter !== "ALL" && p.isWriteOff) return false;
      if (!term) return true;
      const hay = [
        `#${p.receiptNo}`,
        String(p.receiptNo),
        p.method,
        methodLabel(p.method),
        p.note || "",
        p.user?.name || "",
        money(p.amount),
        p.isWriteOff ? "write-off" : "",
        formatWhen(p.createdAt),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
    const pageCount = Math.max(1, Math.ceil(filtered.length / LEDGER_PAGE_SIZE));
    const safePage = Math.min(payPage, pageCount - 1);
    const start = safePage * LEDGER_PAGE_SIZE;
    return {
      filtered,
      pageRows: filtered.slice(start, start + LEDGER_PAGE_SIZE),
      pageCount,
      safePage,
      from: filtered.length ? start + 1 : 0,
      to: Math.min(filtered.length, start + LEDGER_PAGE_SIZE),
      total: filtered.length,
    };
  }, [detail, payQ, payPage, payMethodFilter]);

  if (loading) {
    return <p className="py-16 text-center text-sm text-slate-500">Loading customer…</p>;
  }
  if (error || !detail || !accountStats) {
    return (
      <div className="space-y-3">
        <p className="sf-alert sf-alert-error">{error || "Not found"}</p>
        <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <IconBack /> All customers
        </Link>
      </div>
    );
  }

  const { customer, summary } = detail;
  const ghostBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50";

  function exportStatement(format: "csv" | "print") {
    if (format === "print") {
      window.print();
      setShowDownload(false);
      return;
    }
    const rows = statementPaging.movements.map((e) => ({
      when: e.at ? formatWhen(e.at) : "",
      type: e.label,
      reference: e.ref,
      detail: e.detail || "",
      charged: e.owed || "",
      received: e.paid || "",
      balance_after: e.balanceAfter,
    }));
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statement-${customer.name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownload(false);
  }

  return (
    <div className="space-y-4 px-1 py-1 sm:px-0 [font-variant-numeric:tabular-nums]">
      <section
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200 print:shadow-none"
        aria-label="Customer overview"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${avatarTone(customer.id)}`}
            >
              {initials(customer.name)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                {customer.name}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500">{customer.phone || "No phone"}</span>
                {customer.active ? (
                  <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                    Inactive
                  </span>
                )}
                {summary.owed > 0.009 && (
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                    Owing
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 print:hidden">
            <div className="relative">
              <button
                type="button"
                className={ghostBtn}
                aria-label="More actions: deactivate, write off"
                onClick={() => {
                  setShowMore((v) => !v);
                  setShowDownload(false);
                }}
              >
                More
                <svg className="size-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showMore && (
                <div className="absolute end-0 z-30 mt-1.5 w-44 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setShowMore(false);
                      askToggleActive();
                    }}
                  >
                    <IconUserOff className="size-3.5" />
                    {customer.active ? "Deactivate" : "Activate"}
                  </button>
                  {summary.owed > 0.009 && canWriteOff && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      onClick={() => {
                        setShowMore(false);
                        setFormError("");
                        setWriteAmount(String(summary.owed));
                        setShowWriteOff(true);
                      }}
                    >
                      <IconBan className="size-3.5" />
                      Write off
                    </button>
                  )}
                </div>
              )}
            </div>
            {summary.owed > 0.009 ? (
              <>
                <button
                  type="button"
                  className={ghostBtn}
                  disabled={!canPay}
                  onClick={openAddCredit}
                  title="Deposit prepaid balance on this account"
                >
                  Add store credit
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                  disabled={!canPay}
                  onClick={openPayAll}
                >
                  <IconWallet className="size-3.5" />
                  Record payment
                </button>
              </>
            ) : (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                disabled={!canPay}
                onClick={openAddCredit}
              >
                <IconWallet className="size-3.5" />
                Add store credit
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 border-t border-slate-200 lg:grid-cols-4 lg:divide-y-0">
          <div className="flex flex-col px-3 py-2.5 sm:px-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Outstanding</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {wholeAmount(summary.owed)}
              </span>
              {Math.abs(accountStats.outstandingDelta) >= 0.5 && (
                <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700">
                  {signedWhole(accountStats.outstandingDelta)}
                </span>
              )}
            </div>
            {summary.creditLimit > 0 ? (
              <>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${
                      accountStats.limitPct >= 90
                        ? "bg-rose-500"
                        : accountStats.limitPct >= 60
                          ? "bg-amber-400"
                          : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, accountStats.limitPct)}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between gap-2 text-[10px] text-slate-500">
                  <span>Limit {wholeAmount(summary.creditLimit)}</span>
                  <span
                    className={`font-medium ${
                      (accountStats.available ?? 0) < 1 ? "text-rose-700" : "text-slate-600"
                    }`}
                  >
                    {money(accountStats.available ?? 0)} avail.
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">No credit limit set</p>
            )}
          </div>

          <div className="flex flex-col px-3 py-2.5 sm:px-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Open receipts</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {summary.openReceipts}
              </span>
              {accountStats.openDue > 0.009 && (
                <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700">
                  +{wholeAmount(accountStats.openDue)}
                </span>
              )}
            </div>
            {accountStats.dueSoonCount > 0 ? (
              <p className="mt-1.5 inline-flex items-center gap-1 self-start rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                {accountStats.dueSoonCount} due in 7d · {money(accountStats.dueSoonAmount)}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">
                {summary.openReceipts ? "Nothing due in 7 days" : "No open receipts"}
              </p>
            )}
            <button
              type="button"
              className="mt-1.5 self-start text-[11px] font-medium text-indigo-700 hover:underline print:hidden"
              onClick={() => {
                setTab("open");
                document.getElementById("customer-records")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              View receipts →
            </button>
          </div>

          <div className="flex flex-col px-3 py-2.5 sm:px-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Collected</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {wholeAmount(accountStats.collectedTotal)}
              </span>
              {accountStats.lastPay > 0.009 && (
                <span className="rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-medium text-emerald-700">
                  +{wholeAmount(accountStats.lastPay)}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {detail.payments.length === 0
                ? "No payments yet"
                : `${detail.payments.length} payment${detail.payments.length === 1 ? "" : "s"}${
                    accountStats.lastPaymentAt
                      ? `, last ${new Date(accountStats.lastPaymentAt).toLocaleDateString("en-KE", {
                          day: "numeric",
                          month: "short",
                        })}`
                      : ""
                  }`}
            </p>
            <button
              type="button"
              className="mt-1.5 self-start text-[11px] font-medium text-indigo-700 hover:underline print:hidden"
              onClick={() => {
                setTab("payments");
                document.getElementById("customer-records")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              View payments →
            </button>
          </div>

          <button
            type="button"
            className="flex flex-col px-3 py-2.5 text-left hover:bg-slate-50 sm:px-4 print:pointer-events-none"
            disabled={!canPay}
            onClick={openAddCredit}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Store credit</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tracking-tight text-emerald-700 sm:text-lg">
                {wholeAmount(summary.storeCredit)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {summary.storeCredit > 0.009
                ? "Available for future sales"
                : "Overpayments land here"}
            </p>
            {canPay ? (
              <span className="mt-1.5 self-start text-[11px] font-medium text-indigo-700">
                Add credit →
              </span>
            ) : null}
          </button>
        </div>
      </section>

      <section
        id="customer-records"
        className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-200 print:shadow-none"
      >
        <div className="px-3 pt-2.5 sm:px-4 print:hidden">
          <div role="tablist" aria-label="Customer records" className="inline-flex rounded-md bg-indigo-50 p-0.5">
            {(
              [
                ["statement", "Statement", accountStats.statementRows.length],
                ["open", "Open receipts", summary.openReceipts],
                ["payments", "Payments", detail.payments.length],
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

        {tab === "statement" && (
          <>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4 print:hidden">
              <label className="relative min-w-[160px] flex-1 sm:max-w-xs">
                <span className="sr-only">Search reference or detail</span>
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <IconSearch className="size-4" />
                </span>
                <input
                  type="search"
                  placeholder="Search reference or detail"
                  className="h-8 w-full rounded-lg border-0 bg-white pl-8 pr-2.5 text-xs ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
                  value={ledgerQ}
                  onChange={(e) => {
                    setLedgerQ(e.target.value);
                    setLedgerPage(0);
                  }}
                />
              </label>
              <label className="relative">
                <span className="sr-only">Filter movements</span>
                <select
                  className="h-8 min-w-[140px] appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900"
                  value={ledgerFilter}
                  onChange={(e) => {
                    setLedgerFilter(e.target.value as typeof ledgerFilter);
                    setLedgerPage(0);
                  }}
                >
                  <option value="ALL">All movements</option>
                  <option value="CHARGED">Charged</option>
                  <option value="RECEIVED">Received</option>
                </select>
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  aria-hidden="true"
                >
                  <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </label>
              <div className="relative">
                <button
                  type="button"
                  className={ghostBtn}
                  aria-label="Change date range"
                  aria-expanded={showDateRange}
                  onClick={() => {
                    setDraftFrom(stmtFrom);
                    setDraftTo(stmtTo);
                    setShowDateRange((v) => !v);
                    setShowDownload(false);
                    setShowMore(false);
                  }}
                >
                  <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <rect x="3" y="4.5" width="14" height="12" rx="2" />
                    <path d="M3 8.5h14M7 3v3M13 3v3" strokeLinecap="round" />
                  </svg>
                  {statementPaging.rangeLabel}
                  <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {showDateRange && (
                  <div className="absolute left-0 z-30 mt-1.5 w-64 rounded-lg bg-white p-2.5 shadow-lg ring-1 ring-slate-200 sm:left-auto sm:right-0">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Date range
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ["all", "All dates"],
                          ["today", "Today"],
                          ["week", "This week"],
                          ["month", "This month"],
                          ["last_month", "Last month"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className={`rounded-md px-2 py-1.5 text-left text-xs font-medium ${
                            stmtPreset === key
                              ? "bg-indigo-50 text-indigo-800 ring-1 ring-inset ring-indigo-600/20"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                          onClick={() => {
                            if (key === "all") {
                              setStmtPreset("all");
                              setStmtFrom("");
                              setStmtTo("");
                              setDraftFrom("");
                              setDraftTo("");
                            } else {
                              const range = stmtRangeFor(key);
                              setStmtPreset(key);
                              setStmtFrom(range.from);
                              setStmtTo(range.to);
                              setDraftFrom(range.from);
                              setDraftTo(range.to);
                            }
                            setLedgerPage(0);
                            setShowDateRange(false);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      <label className="block text-xs font-medium text-slate-500">
                        From
                        <input
                          type="date"
                          className="mt-1 h-8 w-full rounded-lg border-0 bg-white px-2.5 text-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900"
                          value={draftFrom}
                          onChange={(e) => {
                            setDraftFrom(e.target.value);
                            setStmtPreset("custom");
                          }}
                        />
                      </label>
                      <label className="block text-xs font-medium text-slate-500">
                        To
                        <input
                          type="date"
                          className="mt-1 h-8 w-full rounded-lg border-0 bg-white px-2.5 text-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900"
                          value={draftTo}
                          onChange={(e) => {
                            setDraftTo(e.target.value);
                            setStmtPreset("custom");
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="inline-flex h-8 w-full items-center justify-center rounded-lg bg-slate-900 px-2.5 text-xs font-semibold text-white hover:bg-slate-800"
                        onClick={() => {
                          let from = draftFrom;
                          let to = draftTo;
                          if (from && to && from > to) {
                            const tmp = from;
                            from = to;
                            to = tmp;
                          }
                          setStmtFrom(from);
                          setStmtTo(to);
                          setStmtPreset(from || to ? "custom" : "all");
                          setLedgerPage(0);
                          setShowDateRange(false);
                        }}
                      >
                        Apply range
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="relative z-20">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
                    onClick={() => {
                      setShowDownload((v) => !v);
                      setShowMore(false);
                      setShowDateRange(false);
                    }}
                  >
                    <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                      <path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M3.5 15.5h13" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Download
                    <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                      <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {showDownload && (
                    <ul className="absolute right-0 mt-2 w-64 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200">
                      <li>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                          onClick={() => exportStatement("print")}
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-rose-100 text-xs font-bold text-rose-700">
                            PDF
                          </span>
                          <span>
                            <span className="block text-sm font-medium text-slate-900">PDF</span>
                            <span className="block text-xs text-slate-500">Best for sending to the customer</span>
                          </span>
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                          onClick={() => exportStatement("csv")}
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-700">
                            XLS
                          </span>
                          <span>
                            <span className="block text-sm font-medium text-slate-900">Excel</span>
                            <span className="block text-xs text-slate-500">Editable spreadsheet (.xlsx)</span>
                          </span>
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                          onClick={() => exportStatement("csv")}
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-100 text-xs font-bold text-sky-700">
                            CSV
                          </span>
                          <span>
                            <span className="block text-sm font-medium text-slate-900">CSV</span>
                            <span className="block text-xs text-slate-500">For accounting software</span>
                          </span>
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                          onClick={() => exportStatement("print")}
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">
                            ⎙
                          </span>
                          <span>
                            <span className="block text-sm font-medium text-slate-900">Print</span>
                            <span className="block text-xs text-slate-500">Open the print dialog</span>
                          </span>
                        </button>
                      </li>
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 border-t border-slate-200 lg:grid-cols-4 lg:divide-y-0">
              <div className="flex flex-col px-3 py-2.5 sm:px-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Opening balance
                </p>
                <span className="mt-0.5 font-mono text-base font-bold tracking-tight text-slate-900">
                  {money(statementPaging.openingBal)}
                </span>
              </div>
              <div className="flex flex-col bg-rose-50/60 px-3 py-2.5 sm:px-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">
                  Charged
                </p>
                <span className="mt-0.5 font-mono text-base font-bold tracking-tight text-rose-800">
                  +{money(statementPaging.chargedTotal)}
                </span>
              </div>
              <div className="flex flex-col bg-emerald-50/60 px-3 py-2.5 sm:px-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  Received
                </p>
                <span className="mt-0.5 font-mono text-base font-bold tracking-tight text-emerald-800">
                  −{money(statementPaging.receivedTotal)}
                </span>
              </div>
              <div className="flex flex-col bg-indigo-50/50 px-3 py-2.5 sm:px-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
                  Closing balance
                </p>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
                  <span className="font-mono text-base font-bold tracking-tight text-indigo-950">
                    {money(statementPaging.closingBal)}
                  </span>
                  {statementPaging.atLimit ? (
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                      At limit
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {!statementPaging.dayGroups?.length ? (
              <p className="border-t border-slate-100 px-4 py-10 text-center text-sm text-slate-500">
                No movements match your search
              </p>
            ) : (
              <div className="overflow-x-auto border-t border-slate-200">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2.5 sm:px-4">Time</th>
                      <th className="px-3 py-2.5 sm:px-4">Transaction</th>
                      <th className="px-3 py-2.5 sm:px-4">Detail</th>
                      <th className="px-3 py-2.5 text-right sm:px-4">Amount</th>
                      <th className="px-3 py-2.5 text-right sm:px-4">Balance after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementPaging.dayGroups.map((g) => (
                      <Fragment key={g.key}>
                        <tr className="border-b border-slate-100 bg-slate-50/90">
                          <td
                            colSpan={5}
                            className="px-3 py-1.5 sm:px-4"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-slate-700">
                                {g.label}
                              </span>
                              <span className="font-mono text-[11px] font-medium text-slate-500">
                                Net {g.net >= 0 ? "+" : "−"}
                                {money(Math.abs(g.net))}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {g.rows.map((e) => {
                          const due = dueChip(e.detail);
                          const detailText =
                            e.detail && !e.detail.startsWith("Credit sale") && !due
                              ? e.detail
                              : null;
                          const receiptHref = receiptHrefFromLedger(e);
                          return (
                            <tr
                              key={e.id}
                              role={receiptHref ? "link" : undefined}
                              tabIndex={receiptHref ? 0 : undefined}
                              onClick={
                                receiptHref ? () => router.push(receiptHref) : undefined
                              }
                              onKeyDown={
                                receiptHref
                                  ? (ev) => {
                                      if (ev.key === "Enter" || ev.key === " ") {
                                        ev.preventDefault();
                                        router.push(receiptHref);
                                      }
                                    }
                                  : undefined
                              }
                              className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/70 ${
                                receiptHref ? "cursor-pointer" : ""
                              }`}
                            >
                              <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-slate-500 sm:px-4">
                                {e.at ? timeLabel(e.at) : "—"}
                              </td>
                              <td className="px-3 py-2.5 sm:px-4">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-semibold text-slate-900">
                                    {e.ref}
                                  </span>
                                  <span
                                    className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${typeBadge(e.type)}`}
                                  >
                                    {e.label}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 sm:px-4">
                                {due ? (
                                  <span className="inline-flex rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                                    Due {due}
                                  </span>
                                ) : detailText ? (
                                  <p className="max-w-xs truncate text-[11px] text-slate-500">
                                    {detailText}
                                  </p>
                                ) : (
                                  <span className="text-[11px] text-slate-300">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-right sm:px-4">
                                {e.owed > 0.009 ? (
                                  <span className="font-mono text-xs font-semibold text-rose-700">
                                    +{money(e.owed)}
                                  </span>
                                ) : e.paid > 0.009 ? (
                                  <span className="font-mono text-xs font-semibold text-emerald-700">
                                    −{money(e.paid)}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-300">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-slate-900 sm:px-4">
                                {money(e.balanceAfter)}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5 text-xs text-slate-500 sm:px-4">
              <span>
                {statementPaging.total
                  ? `Showing ${statementPaging.from} – ${statementPaging.to} of ${statementPaging.total}`
                  : "Showing 0 of 0"}
              </span>
              <div className="flex gap-1.5 print:hidden">
                <button
                  type="button"
                  className={ghostBtn}
                  disabled={statementPaging.safePage <= 0}
                  onClick={() => setLedgerPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className={ghostBtn}
                  disabled={statementPaging.safePage >= statementPaging.pageCount - 1}
                  onClick={() =>
                    setLedgerPage((p) => Math.min(statementPaging.pageCount - 1, p + 1))
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        {tab === "open" && (
          <>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4 print:hidden">
              <label className="relative min-w-[160px] flex-1 sm:max-w-xs">
                <span className="sr-only">Search receipt or amount</span>
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <IconSearch className="size-4" />
                </span>
                <input
                  type="search"
                  placeholder="Search receipt or amount"
                  className="h-8 w-full rounded-lg border-0 bg-white pl-8 pr-2.5 text-xs ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
                  value={openQ}
                  onChange={(e) => {
                    setOpenQ(e.target.value);
                    setOpenPage(0);
                  }}
                />
              </label>
              <label className="relative">
                <span className="sr-only">Filter by status</span>
                <select
                  className="h-8 min-w-[140px] appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900"
                  value={openStatusFilter}
                  onChange={(e) => {
                    setOpenStatusFilter(e.target.value as typeof openStatusFilter);
                    setOpenPage(0);
                  }}
                >
                  <option value="ALL">All statuses</option>
                  <option value="DUE_SOON">Due soon</option>
                  <option value="OPEN">Open</option>
                </select>
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  aria-hidden="true"
                >
                  <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </label>
              <button type="button" className={ghostBtn} aria-label="Change date range">
                <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <rect x="3" y="4.5" width="14" height="12" rx="2" />
                  <path d="M3 8.5h14M7 3v3M13 3v3" strokeLinecap="round" />
                </svg>
                {accountStats.rangeLabel}
                <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-400 disabled:opacity-50"
                  disabled={!customer.phone || accountStats.openDue < 0.01}
                  onClick={() => {
                    const phone = (customer.phone || "").replace(/\s+/g, "");
                    const body = `Hi ${customer.name}, you have KSh ${money(accountStats.openDue)} outstanding across ${summary.openReceipts} open receipt(s). Please arrange payment. Thank you.`;
                    window.location.href = `sms:${phone}?body=${encodeURIComponent(body)}`;
                  }}
                >
                  <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <path d="M3 5h14v9H8l-4 3v-3H3z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Send reminder
                </button>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 md:grid-cols-3">
              <div className="bg-white px-3 py-2 sm:px-4">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sale total</dt>
                <dd className="mt-0.5 text-sm font-bold">{money(accountStats.openSaleTotal)}</dd>
              </div>
              <div className="bg-emerald-50 px-3 py-2 sm:px-4">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Already paid</dt>
                <dd className="mt-0.5 text-sm font-bold text-emerald-800">
                  {money(accountStats.openPaidTotal)}
                </dd>
              </div>
              <div className="col-span-2 bg-rose-50 px-3 py-2 sm:px-4 md:col-span-1">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">Still due</dt>
                <dd className="mt-0.5 text-sm font-bold text-rose-800">
                  {money(accountStats.openDue)}
                </dd>
              </div>
            </dl>

            <div className="sticky top-0 z-10 hidden grid-cols-[minmax(150px,1fr)_120px_120px_minmax(200px,1.3fr)_130px_84px] items-center gap-x-3 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:px-4 md:grid">
              <span>Receipt</span>
              <span className="text-right">Sale total</span>
              <span className="text-right">Already paid</span>
              <span>Still due</span>
              <span>Status</span>
              <span className="sr-only">Action</span>
            </div>

            {!openPaging.pageRows.length ? (
              <p className="border-t border-slate-100 px-4 py-8 text-center text-xs text-slate-500">
                {detail.openCharges.length ? "No receipts match your filters" : "No open credit receipts"}
              </p>
            ) : (
              openPaging.pageRows.map((ch) => {
                const paid = round2(ch.originalCredit - ch.openAmount);
                const st = dueStatus(ch.dueAt, ch.openAmount);
                const paidPct =
                  ch.originalCredit > 0 ? Math.round((paid / ch.originalCredit) * 100) : 0;
                return (
                  <div
                    key={ch.saleId}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/receipts?saleId=${encodeURIComponent(ch.saleId)}`)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        router.push(`/receipts?saleId=${encodeURIComponent(ch.saleId)}`);
                      }
                    }}
                    className="grid cursor-pointer grid-cols-2 gap-x-4 gap-y-1.5 border-t border-slate-100 px-3 py-2 hover:bg-indigo-50/40 sm:px-4 md:grid-cols-[minmax(150px,1fr)_120px_120px_minmax(200px,1.3fr)_130px_84px] md:items-center md:gap-x-3"
                  >
                    <div className="order-1 md:order-none">
                      <p className="text-sm font-semibold text-slate-900">Receipt #{ch.receiptNo}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Sold{" "}
                        {new Date(ch.completedAt).toLocaleDateString("en-KE", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="order-4 md:order-none">
                      <span className="block text-xs text-slate-500 md:hidden">Sale total</span>
                      <span className="text-slate-700 md:block md:text-right">{money(ch.originalCredit)}</span>
                    </div>
                    <div className="order-5 text-right md:order-none">
                      <span className="block text-xs text-slate-500 md:hidden">Already paid</span>
                      <span className="md:block">
                        {paid > 0.009 ? (
                          <span className="font-medium text-emerald-700">{money(paid)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </span>
                    </div>
                    <div className="order-3 col-span-2 md:order-none md:col-span-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-bold text-slate-900">{money(ch.openAmount)}</span>
                        <span className="text-xs text-slate-500">{paidPct}% paid</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${paidPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="order-2 flex justify-end md:order-none md:justify-start">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${st.className}`}
                      >
                        {st.showClock && (
                          <svg
                            className="size-3.5"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            aria-hidden="true"
                          >
                            <circle cx="10" cy="10" r="6.5" />
                            <path d="M10 6.5V10l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {st.label}
                      </span>
                    </div>
                    <div className="order-6 col-span-2 md:order-none md:col-span-1 md:text-right">
                      {canPay && (
                        <button
                          type="button"
                          className="inline-flex h-7 w-full items-center justify-center gap-1 rounded-md bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-600 hover:text-white md:w-auto print:hidden"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openPayReceipt(ch);
                          }}
                        >
                          <IconWallet className="size-4" />
                          Pay
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            <TablePager
              from={openPaging.from}
              to={openPaging.to}
              total={openPaging.total}
              noun="receipts"
              page={openPaging.safePage}
              pageCount={openPaging.pageCount}
              onPage={setOpenPage}
            />
          </>
        )}

        {tab === "payments" && (
          <>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4 print:hidden">
              <label className="relative min-w-[160px] flex-1 sm:max-w-xs">
                <span className="sr-only">Search payment, receipt or collector</span>
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <IconSearch className="size-4" />
                </span>
                <input
                  type="search"
                  placeholder="Search payment, receipt or collector"
                  className="h-8 w-full rounded-lg border-0 bg-white pl-8 pr-2.5 text-xs ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
                  value={payQ}
                  onChange={(e) => {
                    setPayQ(e.target.value);
                    setPayPage(0);
                  }}
                />
              </label>
              <label className="relative">
                <span className="sr-only">Filter by method</span>
                <select
                  className="h-8 min-w-[140px] appearance-none rounded-lg border-0 bg-white py-0 pl-2.5 pr-8 text-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-slate-900"
                  value={payMethodFilter}
                  onChange={(e) => {
                    setPayMethodFilter(e.target.value as typeof payMethodFilter);
                    setPayPage(0);
                  }}
                >
                  <option value="ALL">All methods</option>
                  <option value="CASH">Cash</option>
                  <option value="MPESA">Mobile money</option>
                  <option value="BANK">Bank transfer</option>
                </select>
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  aria-hidden="true"
                >
                  <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </label>
              <button type="button" className={ghostBtn} aria-label="Change date range">
                <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <rect x="3" y="4.5" width="14" height="12" rx="2" />
                  <path d="M3 8.5h14M7 3v3M13 3v3" strokeLinecap="round" />
                </svg>
                {accountStats.rangeLabel}
                <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 md:grid-cols-3">
              <div className="bg-emerald-50 px-3 py-2 sm:px-4">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Total received</dt>
                <dd className="mt-0.5 text-sm font-bold text-emerald-800">
                  {money(accountStats.collectedTotal)}
                </dd>
              </div>
              <div className="bg-white px-3 py-2 sm:px-4">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Payments</dt>
                <dd className="mt-0.5 text-sm font-bold">{detail.payments.length}</dd>
              </div>
              <div className="col-span-2 bg-indigo-50 px-3 py-2 sm:px-4 md:col-span-1">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">Last payment</dt>
                <dd className="mt-0.5 text-sm font-bold text-indigo-950">
                  {accountStats.lastPaymentAt
                    ? new Date(accountStats.lastPaymentAt).toLocaleDateString("en-KE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </dd>
              </div>
            </dl>

            <div className="sticky top-0 z-10 hidden grid-cols-[minmax(150px,1fr)_110px_minmax(120px,1fr)_minmax(150px,1fr)_140px_110px] items-center gap-x-3 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:px-4 md:grid">
              <span>Payment</span>
              <span>Method</span>
              <span>Applied to</span>
              <span>Collected by</span>
              <span className="text-right">Amount in</span>
              <span className="sr-only">Actions</span>
            </div>

            {!payPaging.pageRows.length ? (
              <p className="border-t border-slate-100 px-4 py-8 text-center text-xs text-slate-500">
                {detail.payments.length ? "No payments match your filters" : "No payments recorded yet"}
              </p>
            ) : (
              payPaging.pageRows.map((p) => {
                const settled = detail.ledger
                  .filter(
                    (l) =>
                      (l.ref === `Payment #${p.receiptNo}` ||
                        l.ref === `Write-off #${p.receiptNo}`) &&
                      l.detail?.match(/receipt #(\d+)/i)
                  )
                  .map((l) => {
                    const m = l.detail?.match(/receipt #(\d+)/i);
                    return m ? m[1] : null;
                  })
                  .filter(Boolean) as string[];
                const collector = p.user?.name || "—";
                return (
                  <div
                    key={p.id}
                    className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-slate-100 px-3 py-2 hover:bg-emerald-50/40 sm:px-4 md:grid-cols-[minmax(150px,1fr)_110px_minmax(120px,1fr)_minmax(150px,1fr)_140px_110px] md:items-center md:gap-x-3"
                  >
                    <div className="order-1 md:order-none">
                      <p className="text-sm font-semibold text-slate-900">Payment #{p.receiptNo}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{formatWhen(p.createdAt)}</p>
                    </div>
                    <div className="order-3 md:order-none">
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                        {p.isWriteOff ? "Write-off" : methodLabel(p.method)}
                      </span>
                    </div>
                    <div className="order-4 text-right md:order-none md:text-left">
                      {settled.length ? (
                        <div className="flex flex-wrap justify-end gap-1 md:justify-start">
                          {settled.map((rn) => (
                            <span
                              key={rn}
                              className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-sm font-medium text-indigo-700"
                            >
                              Receipt #{rn}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>
                    <div className="order-5 col-span-2 flex items-center gap-2.5 md:order-none md:col-span-1">
                      <span className="grid size-8 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {collector === "—" ? "?" : initials(collector)}
                      </span>
                      <span className="text-sm text-slate-900">{collector}</span>
                    </div>
                    <div className="order-2 text-right md:order-none">
                      <span className="inline-block rounded-lg bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">
                        +{money(p.amount)}
                      </span>
                    </div>
                    <div className="order-6 col-span-2 md:order-none md:col-span-1 md:text-right">
                      <button
                        type="button"
                        className={`${ghostBtn} w-full justify-center md:w-auto print:hidden`}
                        onClick={() => reprintPayment(p)}
                      >
                        <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                          <path d="M6 7V3h8v4M6 14H4V8h12v6h-2M6 11h8v6H6z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Reprint
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            <TablePager
              from={payPaging.from}
              to={payPaging.to}
              total={payPaging.total}
              noun="payments"
              page={payPaging.safePage}
              pageCount={payPaging.pageCount}
              onPage={setPayPage}
            />
          </>
        )}
      </section>

      {showPay &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closePayModal();
            }}
          >
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="pay-modal-title"
              onSubmit={(e) => submitPayment(e, false)}
              className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                    <IconWallet className="size-6" />
                  </span>
                  <div>
                    <h2
                      id="pay-modal-title"
                      className="text-xl font-semibold tracking-tight text-slate-900"
                    >
                      {payTargetReceipt
                        ? `Pay receipt #${payTargetReceipt.receiptNo}`
                        : payIntent === "credit"
                          ? "Add store credit"
                          : summary.owed > 0.009
                            ? "Record payment"
                            : "Add store credit"}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {payIntent === "credit" || summary.owed <= 0.009 ? (
                        <>
                          {customer.name} · prepaid balance for future sales
                          {summary.storeCredit > 0.009 ? (
                            <>
                              {" "}
                              · current credit{" "}
                              <span className="font-semibold text-emerald-700">
                                KSh {money(summary.storeCredit)}
                              </span>
                            </>
                          ) : null}
                          {summary.owed > 0.009 ? (
                            <>
                              {" "}
                              · open debt{" "}
                              <span className="font-semibold text-rose-700">
                                KSh {money(summary.owed)}
                              </span>{" "}
                              is cleared first
                            </>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {customer.name} · {payTargetReceipt ? "this receipt" : "owes"}{" "}
                          <span className="font-semibold text-rose-700">
                            KSh{" "}
                            {money(
                              payTargetReceipt
                                ? payTargetReceipt.openAmount
                                : summary.owed
                            )}
                          </span>
                          <span className="text-slate-400">
                            {" "}
                            · pay more to keep the rest as store credit
                          </span>
                        </>
                      )}
                    </p>
                    {payTargetReceipt &&
                      (() => {
                        const others = detail.openCharges.filter(
                          (ch) => ch.saleId !== payTargetReceipt.saleId
                        );
                        if (!others.length) return null;
                        const othersDue = round2(
                          others.reduce((s, ch) => s + ch.openAmount, 0)
                        );
                        return (
                          <p className="mt-0.5 text-sm text-slate-500">
                            Account still owes{" "}
                            <span className="font-semibold text-slate-900">
                              KSh {money(othersDue)}
                            </span>{" "}
                            on {others.length} other receipt{others.length === 1 ? "" : "s"} · KSh{" "}
                            {money(summary.owed)} total
                          </p>
                        );
                      })()}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900"
                  onClick={closePayModal}
                >
                  <svg
                    className="size-5"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
                {formError && (
                  <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
                    {formError}
                  </p>
                )}

                <div>
                  <div className="flex items-baseline justify-between">
                    <label
                      htmlFor="pay-amount"
                      className="text-sm font-medium text-slate-700"
                    >
                      {payIntent === "credit" ? "Credit amount" : "Amount received"}
                    </label>
                    {summary.owed > 0.009 ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-indigo-700 hover:underline"
                        onClick={() =>
                          setPayAmount(
                            String(
                              payTargetReceipt
                                ? payTargetReceipt.openAmount
                                : summary.owed
                            )
                          )
                        }
                      >
                        Pay full balance
                      </button>
                    ) : null}
                  </div>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium text-slate-400">
                      KSh
                    </span>
                    <input
                      id="pay-amount"
                      inputMode="decimal"
                      autoComplete="off"
                      autoFocus
                      value={payAmount}
                      onChange={(e) => setPayAmountFromInput(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="h-14 w-full rounded-xl border-0 bg-white pl-16 pr-4 text-2xl font-semibold text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500" aria-live="polite">
                    {payStats.amount === 0 ? (
                      "Enter the amount the customer paid."
                    ) : payTargetReceipt ? (
                      payStats.amount + 0.009 < payTargetReceipt.openAmount ? (
                        <>
                          Leaves{" "}
                          <span className="font-medium text-slate-900">
                            KSh {money(round2(payTargetReceipt.openAmount - payStats.amount))}
                          </span>{" "}
                          on receipt #{payTargetReceipt.receiptNo}.
                        </>
                      ) : (
                        <span className="font-medium text-emerald-700">
                          Clears receipt #{payTargetReceipt.receiptNo}.
                          {payStats.toOthers > 0.009 && (
                            <span className="text-indigo-700">
                              {" "}
                              KSh {money(payStats.toOthers)} goes to other open receipts,
                              oldest first.
                            </span>
                          )}
                          {payStats.storeCredit > 0.009 && (
                            <span className="text-indigo-700">
                              {" "}
                              KSh {money(payStats.storeCredit)} is kept as store credit for
                              future sales.
                            </span>
                          )}
                        </span>
                      )
                    ) : payStats.storeCredit > 0.009 ? (
                      <span className="font-medium text-indigo-700">
                        KSh {money(payStats.storeCredit)} is more than the balance and
                        will be kept as store credit for future sales.
                      </span>
                    ) : payStats.stillDue > 0.009 ? (
                      <>
                        Leaves{" "}
                        <span className="font-medium text-slate-900">
                          KSh {money(payStats.stillDue)}
                        </span>{" "}
                        still due.
                      </>
                    ) : (
                      <span className="font-medium text-emerald-700">
                        This clears the full balance.
                      </span>
                    )}
                  </p>
                </div>

                <fieldset>
                  <legend className="text-sm font-medium text-slate-700">Method</legend>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {(
                      [
                        { value: "CASH", label: "Cash" },
                        { value: "MPESA", label: "Mobile money" },
                        { value: "BANK", label: "Bank transfer" },
                      ] as const
                    ).map((m) => (
                      <label key={m.value} className="cursor-pointer">
                        <input
                          type="radio"
                          name="pay-method"
                          value={m.value}
                          className="peer sr-only"
                          checked={payMethod === m.value}
                          onChange={() => setPayMethod(m.value)}
                        />
                        <span className="flex h-11 items-center justify-center rounded-lg text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 peer-checked:bg-indigo-50 peer-checked:text-indigo-800 peer-checked:ring-2 peer-checked:ring-indigo-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600">
                          {m.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="pay-ref" className="text-sm font-medium text-slate-700">
                      Reference{" "}
                      <span className="font-normal text-slate-500">(optional)</span>
                    </label>
                    <input
                      id="pay-ref"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="e.g. bank slip number"
                      className="mt-1.5 h-11 w-full rounded-lg border-0 bg-white px-3.5 text-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="pay-note" className="text-sm font-medium text-slate-700">
                      Note{" "}
                      <span className="font-normal text-slate-500">(optional)</span>
                    </label>
                    <input
                      id="pay-note"
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      placeholder="e.g. part payment on cement"
                      className="mt-1.5 h-11 w-full rounded-lg border-0 bg-white px-3.5 text-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                </div>

                {allocations.length > 0 ? (
                  <section
                    aria-labelledby="pay-alloc"
                    className="overflow-hidden rounded-xl ring-1 ring-slate-200"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <h3 id="pay-alloc" className="font-semibold text-slate-900">
                          {payTargetSaleId && allocations.length === 1
                            ? "Applied to this receipt"
                            : "Split across receipts"}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {!payTargetReceipt
                            ? "Oldest first, by due date then sale date. Excess becomes store credit."
                            : allocations.length === 1
                              ? "Only this open receipt will be reduced. Excess becomes store credit."
                              : `Receipt #${payTargetReceipt.receiptNo} first, then the rest oldest first. Excess becomes store credit.`}
                        </p>
                      </div>
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                        Automatic
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-slate-100 px-4 py-2 text-xs font-medium text-slate-500 sm:grid-cols-[1fr_110px_120px_90px]">
                      <span>Receipt</span>
                      <span className="hidden text-right sm:block">Outstanding</span>
                      <span className="text-right">Allocate (KSh)</span>
                      <span className="hidden text-right sm:block">Result</span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {allocations.map((a) => {
                        const cleared = a.allocate > 0.009 && a.allocate >= a.openAmount - 0.009;
                        const part = a.allocate > 0.009 && !cleared;
                        return (
                          <li
                            key={a.saleId}
                            className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-3 sm:grid-cols-[1fr_110px_120px_90px] ${
                              a.allocate > 0.009 ? "bg-emerald-50/40" : ""
                            }`}
                          >
                            <div>
                              <p className="font-semibold text-slate-900">
                                Receipt #{a.receiptNo}
                              </p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                                Sold {shortDate(a.completedAt)}{" "}
                                {a.dueAt ? (
                                  <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                                    Due {shortDate(a.dueAt)}
                                  </span>
                                ) : (
                                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                                    No due date
                                  </span>
                                )}
                              </p>
                            </div>
                            <span className="hidden text-right text-sm text-slate-600 sm:block">
                              {money(a.openAmount)}
                            </span>
                            <span
                              className={`text-right ${
                                a.allocate > 0.009
                                  ? "font-semibold text-emerald-800"
                                  : "text-slate-400"
                              }`}
                            >
                              {money(a.allocate)}
                            </span>
                            <span className="hidden text-right sm:block">
                              {cleared ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                                  Cleared
                                </span>
                              ) : part ? (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                                  Part paid
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="grid grid-cols-3 gap-px bg-slate-200 text-sm">
                      <div className="bg-rose-50 px-4 py-3">
                        <p className="text-rose-700">Outstanding</p>
                        <p className="font-semibold text-rose-900">
                          {money(payStats.outstanding)}
                        </p>
                      </div>
                      <div className="bg-emerald-50 px-4 py-3">
                        <p className="text-emerald-700">Applied to debt</p>
                        <p className="font-semibold text-emerald-900">
                          {money(payStats.allocated)}
                        </p>
                      </div>
                      <div className="bg-indigo-50 px-4 py-3">
                        <p className="text-indigo-700">
                          {payStats.storeCredit > 0.009
                            ? "Kept as store credit"
                            : "Still due after"}
                        </p>
                        <p className="font-semibold text-indigo-950">
                          {money(
                            payStats.storeCredit > 0.009
                              ? payStats.storeCredit
                              : payStats.stillDue
                          )}
                        </p>
                      </div>
                    </div>
                  </section>
                ) : payStats.amount > 0.009 ? (
                  <section
                    aria-labelledby="pay-credit-only"
                    className="overflow-hidden rounded-xl ring-1 ring-slate-200"
                  >
                    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <h3 id="pay-credit-only" className="font-semibold text-slate-900">
                        How this is applied
                      </h3>
                      <p className="text-sm text-slate-500">
                        No open receipts — the full amount is kept as store credit.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-slate-200 text-sm">
                      <div className="bg-emerald-50 px-4 py-3">
                        <p className="text-emerald-700">Applied to debt</p>
                        <p className="font-semibold text-emerald-900">0.00</p>
                      </div>
                      <div className="bg-indigo-50 px-4 py-3">
                        <p className="text-indigo-700">Kept as store credit</p>
                        <p className="font-semibold text-indigo-950">
                          {money(payStats.amount)}
                        </p>
                      </div>
                    </div>
                  </section>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
                <p className="text-sm text-slate-500" aria-live="polite">
                  {payStats.amount > 0
                    ? payStats.storeCredit > 0.009
                      ? `Debt ${money(payStats.allocated)} · credit ${money(payStats.storeCredit)}`
                      : `Applied KSh ${money(payStats.allocated)} of KSh ${money(payStats.amount)}`
                    : ""}
                </p>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    className="h-11 rounded-lg bg-white px-5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    onClick={closePayModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || payStats.amount <= 0}
                    className="inline-flex h-11 items-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                  >
                    <svg
                      className="size-4"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 10.5l4 4 8-9" />
                    </svg>
                    {saving
                      ? "Saving…"
                      : payIntent === "credit" ||
                          (summary.owed <= 0.009 && payStats.storeCredit > 0.009)
                        ? `Add KSh ${money(payStats.amount)} credit`
                        : `Record KSh ${money(payStats.amount)}`}
                  </button>
                </div>
              </div>
            </form>
          </div>,
          document.body
        )}

      {showWriteOff && (
        <div className="sf-modal-backdrop">
          <form
            onSubmit={(e) => submitPayment(e, true)}
            className="sf-modal max-w-md space-y-3"
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Write off debt</h2>
              <p className="mt-1 text-sm text-slate-500">
                Clear what {customer.name} owes without receiving any money. This is not a refund
                and not a correction: it records that the shop has given up on collecting. It cannot
                be undone from here.
              </p>
            </div>
            {formError && <p className="sf-alert sf-alert-error">{formError}</p>}
            <label className="block text-xs font-medium text-slate-500">
              Amount to write off
              <input
                className="sf-input mt-1"
                inputMode="decimal"
                value={writeAmount}
                onChange={(e) => setWriteAmount(e.target.value)}
                required
              />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              Reason *
              <textarea
                className="sf-input mt-1 min-h-[88px]"
                value={writeReason}
                onChange={(e) => setWriteReason(e.target.value)}
                placeholder="For example: customer relocated, debt uncollectable after three visits"
                required
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-400">
                Required. There is no ledger entry to explain a write-off, so this note is the only
                account of why it happened.
              </span>
            </label>
            {detail.openCharges.length > 0 && (
              <div className="rounded-lg border border-slate-200 text-xs">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-semibold text-slate-600">
                  Applied oldest first
                </div>
                <ul className="divide-y divide-slate-50">
                  {(() => {
                    let left = Number(writeAmount) || 0;
                    return detail.openCharges.map((ch) => {
                      const alloc = Math.min(ch.openAmount, Math.max(0, left));
                      left = round2(left - alloc);
                      return (
                        <li key={ch.saleId} className="flex justify-between px-3 py-2">
                          <span>Write off against receipt {ch.receiptNo}</span>
                          <span className="tabular-nums font-medium">{money(alloc)}</span>
                        </li>
                      );
                    });
                  })()}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={ghostBtn} onClick={() => setShowWriteOff(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[var(--sf-brand)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "Saving…" : "Write off debt"}
              </button>
            </div>
          </form>
        </div>
      )}

      {receipt && (
        <div className="sf-modal-backdrop receipt-print-root">
          <div className="sf-modal max-w-sm">
            <div className="no-print mb-3 flex items-start justify-between gap-2">
              <h2 className="font-semibold text-slate-900">
                {receipt.isWriteOff ? "Write-off" : "Payment"} #{receipt.receiptNo}
              </h2>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                onClick={() => setReceipt(null)}
              >
                ×
              </button>
            </div>
            <PaymentReceipt data={receipt} />
            <div className="no-print mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg bg-[var(--sf-brand)] px-3 py-2 text-sm font-medium text-white"
                onClick={() => window.print()}
              >
                Print 80mm
              </button>
              <button type="button" className={ghostBtn} onClick={() => setReceipt(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmToggle}
        title={
          detail?.customer.active
            ? `Deactivate ${detail.customer.name}?`
            : `Activate ${detail?.customer.name || "customer"}?`
        }
        message={
          detail?.customer.active
            ? "They will be hidden from new sales. Existing balances and history stay on file."
            : "They will appear again when selecting a customer on POS and credit sales."
        }
        confirmLabel={detail?.customer.active ? "Deactivate" : "Activate"}
        tone={detail?.customer.active ? "danger" : "success"}
        loading={toggleBusy}
        onCancel={() => {
          if (!toggleBusy) setConfirmToggle(false);
        }}
        onConfirm={runToggleActive}
      />
    </div>
  );
}
