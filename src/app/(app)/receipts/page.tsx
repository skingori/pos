"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { formatKes } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import { canApproveRefund } from "@/lib/permissions";
import { ThermalReceipt } from "@/components/thermal-receipt";
import { A4TaxInvoice } from "@/components/a4-tax-invoice";
import { printA4Invoice, printThermalReceipt } from "@/lib/print-thermal";
import {
  downloadReceiptPdf,
  emailReceipt,
  receiptPlainText,
} from "@/lib/receipt-export";
import {
  RecordPaymentModal,
  type RecordPaymentTarget,
} from "@/components/record-payment-modal";
import {
  ReceiptRefundModal,
  type RefundSaleTarget,
} from "@/components/receipt-refund-modal";
import {
  VoidCreditModal,
  type VoidCreditTarget,
} from "@/components/void-credit-modal";
import { IconClose } from "@/components/ui/icons";

type ReceiptViewMode = "thermal" | "a4";

type SaleLine = {
  productId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  unit: string;
};

type Payment = {
  method: string;
  amount: number;
  mpesaReceipt?: string | null;
};

type Sale = {
  id: string;
  receiptNo: number;
  total: number;
  subtotal: number;
  discount: number;
  taxAmount: number;
  taxRate: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
  creditBalanceBefore?: number | null;
  customer: { id: string; name: string; phone?: string | null } | null;
  cashier: { name: string };
  payments: Payment[];
  lines: SaleLine[];
};

type Settings = {
  shopName: string;
  address?: string | null;
  phone?: string | null;
  kraPin?: string | null;
  receiptFooter: string;
};

type DatePreset =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "last_month"
  | "all"
  | "custom";
type QuickFilter = "all" | "MPESA" | "CASH" | "CREDIT" | "partial";

const ALL_TIME_TAKE = 2000;

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function rangeFor(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = ymd(now);
  if (preset === "all") return { from: "", to: "" };
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const day = ymd(y);
    return { from: day, to: day };
  }
  if (preset === "week") return { from: ymd(startOfWeek(now)), to: today };
  if (preset === "month") {
    return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
  if (preset === "last_month") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: ymd(first), to: ymd(last) };
  }
  return { from: today, to: today };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";
}

function methodSet(s: Sale) {
  return new Set(s.payments.map((p) => p.method.toUpperCase()));
}

function hasCredit(s: Sale) {
  return methodSet(s).has("CREDIT");
}

function isPartial(s: Sale) {
  const methods = methodSet(s);
  return methods.has("CREDIT") && methods.size > 1;
}

function methodPrimary(s: Sale): "CASH" | "MPESA" | "CREDIT" | "SPLIT" | "NONE" {
  const methods = [...methodSet(s)];
  if (!methods.length) return "NONE";
  if (methods.length > 1) return "SPLIT";
  if (methods[0] === "CASH" || methods[0] === "MPESA" || methods[0] === "CREDIT") {
    return methods[0];
  }
  return "NONE";
}

function methodLabel(key: string) {
  if (key === "CASH") return "Cash";
  if (key === "MPESA") return "M-Pesa";
  if (key === "CREDIT") return "Credit Account";
  if (key === "SPLIT") return "Split Payment";
  return key;
}

function methodBadgeClass(key: string) {
  if (key === "CASH") return "bg-slate-100 text-slate-700 border-slate-200";
  if (key === "MPESA") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (key === "CREDIT") return "bg-amber-50 text-amber-900 border-amber-200";
  if (key === "SPLIT") return "bg-orange-50 text-orange-800 border-orange-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function paymentRef(s: Sale) {
  const mpesa = s.payments.find((p) => p.mpesaReceipt);
  if (mpesa?.mpesaReceipt) return mpesa.mpesaReceipt;
  if (hasCredit(s)) return "On account";
  if (methodPrimary(s) === "CASH") return "Till cash";
  return s.cashier.name;
}

function formatMoneyParts(n: number) {
  const [whole, frac] = Math.abs(n).toFixed(2).split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return { whole: `${n < 0 ? "-" : ""}${withCommas}`, frac };
}

export default function ReceiptsPage() {
  const { data: session } = useSession();
  const canVoid = session?.user?.role
    ? canApproveRefund(session.user.role as Role)
    : false;
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<DatePreset>("today");
  const [from, setFrom] = useState(() => rangeFor("today").from);
  const [to, setTo] = useState(() => rangeFor("today").to);
  const [showCustomDates, setShowCustomDates] = useState(false);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [method, setMethod] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [payTarget, setPayTarget] = useState<RecordPaymentTarget | null>(null);
  const [refundTarget, setRefundTarget] = useState<RefundSaleTarget | null>(null);
  const [voidTarget, setVoidTarget] = useState<VoidCreditTarget | null>(null);
  const [batchReady, setBatchReady] = useState(false);
  const [receiptView, setReceiptView] = useState<ReceiptViewMode>("thermal");
  const [emailTo, setEmailTo] = useState("");
  const [receivables, setReceivables] = useState<{
    owed: number;
    debtors: number;
    names: string[];
  }>({ owed: 0, debtors: 0, names: [] });
  const [openBySaleId, setOpenBySaleId] = useState<Record<string, number>>({});

  function applyPreset(next: DatePreset) {
    setPreset(next);
    if (next === "custom") {
      setShowCustomDates(true);
      if (!from || !to) {
        const today = rangeFor("today");
        setFrom(today.from);
        setTo(today.to);
      }
      return;
    }
    setShowCustomDates(false);
    const range = rangeFor(next);
    setFrom(range.from);
    setTo(range.to);
  }

  function applyQuick(next: QuickFilter) {
    setQuick(next);
    if (next === "all") {
      setMethod("");
      setStatusFilter("all");
      return;
    }
    if (next === "partial") {
      setMethod("");
      setStatusFilter("credit");
      return;
    }
    setMethod(next);
    setStatusFilter(next === "CREDIT" ? "credit" : "all");
  }

  function resetFilters() {
    applyPreset("today");
    setMinAmount("");
    setMaxAmount("");
    setMethod("");
    setStatusFilter("all");
    setQuick("all");
    setQ("");
  }

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (minAmount !== "") params.set("minAmount", minAmount);
    if (maxAmount !== "") params.set("maxAmount", maxAmount);
    if (method) params.set("method", method);
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "paid" || statusFilter === "credit" || statusFilter === "balance_due") {
        // Balance due is refined client-side from openCharges; seed with credit sales.
        params.set("credit", statusFilter === "paid" ? "paid" : "credit");
      } else {
        params.set("status", statusFilter);
      }
    }
    if (q.trim()) params.set("q", q.trim());
    params.set("take", preset === "all" ? String(ALL_TIME_TAKE) : "500");

    const [list, s, recv] = await Promise.all([
      fetch(`/api/sales?${params}`).then((r) => r.json()),
      settings
        ? Promise.resolve(settings)
        : fetch("/api/settings").then((r) => r.json()),
      fetch("/api/receivables").then((r) => r.json()).catch(() => null),
    ]);
    if (s) setSettings(s);

    const openMap: Record<string, number> = {};
    if (recv?.summary) {
      const names = Array.isArray(recv.customers)
        ? recv.customers
            .filter((c: { balance?: number }) => Number(c.balance) > 0)
            .slice(0, 2)
            .map((c: { name?: string }) => c.name || "Customer")
        : [];
      setReceivables({
        owed: Number(recv.summary.owed || 0),
        debtors: Number(recv.summary.debtors || 0),
        names,
      });
      if (Array.isArray(recv.openCharges)) {
        for (const ch of recv.openCharges as { saleId?: string; openAmount?: number }[]) {
          if (!ch?.saleId) continue;
          const amt = Number(ch.openAmount) || 0;
          if (amt > 0.009) openMap[ch.saleId] = amt;
        }
      }
    }
    setOpenBySaleId(openMap);

    const rows = Array.isArray(list) ? (list as Sale[]) : [];
    setSales(
      statusFilter === "balance_due"
        ? rows.filter((sale) => Number(openMap[sale.id] || 0) > 0.009)
        : rows
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, minAmount, maxAmount, method, statusFilter, q, preset]);

  useEffect(() => {
    setPage(1);
    setCheckedIds(new Set());
  }, [from, to, minAmount, maxAmount, method, statusFilter, q, pageSize, quick]);

  useEffect(() => {
    if (!selected) return;
    setReceiptView("thermal");
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  useEffect(() => {
    if (!batchReady) return;
    const id = window.setTimeout(() => {
      printThermalReceipt("thermal-batch-print");
      setBatchReady(false);
    }, 50);
    return () => window.clearTimeout(id);
  }, [batchReady]);

  const displaySales = useMemo(() => {
    if (quick !== "partial") return sales;
    return sales.filter(isPartial);
  }, [sales, quick]);

  const pageCount = Math.max(1, Math.ceil(displaySales.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = displaySales.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(safePage * pageSize, displaySales.length);
  const paged = displaySales.slice((safePage - 1) * pageSize, safePage * pageSize);

  const kpis = useMemo(() => {
    const isVoidedSale = (s: Sale) =>
      s.status === "VOIDED" || s.status === "CANCELLED";
    const active = sales.filter((s) => !isVoidedSale(s));
    const voidedSales = sales.filter(isVoidedSale);
    const net = active.reduce((sum, s) => sum + s.total, 0);
    const count = active.length;
    const avg = count ? net / count : 0;
    const voided = voidedSales.length;
    const voidedAmount = voidedSales.reduce((sum, s) => sum + s.total, 0);
    let cash = 0;
    let mpesa = 0;
    let creditAmt = 0;
    for (const s of active) {
      for (const p of s.payments) {
        const m = p.method.toUpperCase();
        if (m === "CASH") cash += p.amount;
        else if (m === "MPESA") mpesa += p.amount;
        else if (m === "CREDIT") creditAmt += p.amount;
      }
    }
    const paid = cash + mpesa + creditAmt || 1;
    return {
      net,
      count,
      avg,
      voided,
      voidedAmount,
      cash,
      mpesa,
      creditAmt,
      pctCash: Math.round((cash / paid) * 100),
      pctMpesa: Math.round((mpesa / paid) * 100),
      pctCredit: Math.round((creditAmt / paid) * 100),
    };
  }, [sales]);

  const counts = useMemo(() => {
    let mpesa = 0;
    let cash = 0;
    let creditCount = 0;
    let partial = 0;
    for (const s of sales) {
      if (s.status === "CANCELLED" || s.status === "VOIDED") continue;
      const primary = methodPrimary(s);
      if (primary === "MPESA") mpesa += 1;
      else if (primary === "CASH") cash += 1;
      else if (primary === "CREDIT") creditCount += 1;
      else if (primary === "SPLIT") {
        if (hasCredit(s)) creditCount += 1;
        else cash += 1;
      }
      if (isPartial(s)) partial += 1;
    }
    return { all: sales.length, mpesa, cash, credit: creditCount, partial };
  }, [sales]);

  function exportCsv() {
    const rows = displaySales.map((s) => ({
      receipt: s.receiptNo,
      date: s.completedAt || s.createdAt,
      customer: s.customer?.name || "Walk-in",
      cashier: s.cashier.name,
      total: s.total,
      status: s.status,
      payments: s.payments
        .map((p) =>
          p.mpesaReceipt ? `${p.method}:${p.mpesaReceipt}` : p.method
        )
        .join("|"),
      items: s.lines.map((l) => `${l.name} x${l.qty}`).join("; "),
    }));
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipts-${from || "all"}-${to || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function receiptData(s: Sale) {
    return {
      ...s,
      cashier: s.cashier.name,
      customer: s.customer
        ? { name: s.customer.name, phone: s.customer.phone }
        : null,
      openBalance: openAmountFor(s.id),
      shopName: settings!.shopName,
      address: settings!.address,
      phone: settings!.phone,
      kraPin: settings!.kraPin,
      receiptFooter: settings!.receiptFooter || "Thank you!",
    };
  }

  const checkedSales = useMemo(
    () => displaySales.filter((s) => checkedIds.has(s.id)),
    [displaySales, checkedIds]
  );

  const allPageChecked =
    paged.length > 0 && paged.every((s) => checkedIds.has(s.id));

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllPage() {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (allPageChecked) {
        for (const s of paged) next.delete(s.id);
      } else {
        for (const s of paged) next.add(s.id);
      }
      return next;
    });
  }

  function openAmountFor(saleId: string) {
    return Number(openBySaleId[saleId] || 0);
  }

  function openPayment(s: Sale) {
    if (!s.customer?.id) return;
    const outstanding = openAmountFor(s.id);
    if (outstanding <= 0.009) return;
    setPayTarget({
      saleId: s.id,
      receiptNo: s.receiptNo,
      customerId: s.customer.id,
      customerName: s.customer.name,
      customerPhone: s.customer.phone,
      outstanding,
    });
  }

  function toRefundTarget(s: Sale): RefundSaleTarget | null {
    const lines = s.lines
      .filter((l) => Boolean(l.productId))
      .map((l) => ({
        productId: l.productId as string,
        name: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        unit: l.unit,
      }));
    if (!lines.length) return null;
    return {
      id: s.id,
      receiptNo: s.receiptNo,
      customerId: s.customer?.id || null,
      customerName: s.customer?.name || "Walk-in Customer",
      customerPhone: s.customer?.phone,
      status: s.status,
      payments: s.payments,
      lines,
    };
  }

  function openRefund(s: Sale) {
    const target = toRefundTarget(s);
    if (!target) return;
    setSelected(null);
    setRefundTarget(target);
  }

  function canVoidCredit(s: Sale) {
    if (!canVoid) return false;
    const openAmt = openAmountFor(s.id);
    if (openAmt <= 0.009 || !s.customer?.id) return false;
    if (s.status === "CANCELLED" || s.status === "REFUNDED") return false;
    const collected = s.payments
      .filter((p) => p.method.toUpperCase() !== "CREDIT")
      .reduce((sum, p) => sum + p.amount, 0);
    return collected <= 0.009;
  }

  function openVoid(s: Sale) {
    const openAmt = openAmountFor(s.id);
    if (!canVoidCredit(s) || !s.customer) return;
    setSelected(null);
    setVoidTarget({
      saleId: s.id,
      receiptNo: s.receiptNo,
      customerName: s.customer.name,
      openAmount: openAmt,
    });
  }

  function printBatch() {
    if (!checkedSales.length || !settings) return;
    setBatchReady(true);
  }

  const periodPresets: { id: DatePreset; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "week", label: "This week" },
    { id: "month", label: "This month" },
    { id: "last_month", label: "Last month" },
  ];

  const periodLabel = (() => {
    const labels: Record<DatePreset, string> = {
      today: `Today · ${new Date().toLocaleDateString("en-KE", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`,
      yesterday: "Yesterday",
      week: "This week",
      month: "This month",
      last_month: "Last month",
      all:
        sales.length >= ALL_TIME_TAKE
          ? `All time · latest ${ALL_TIME_TAKE.toLocaleString()} receipts`
          : "All time",
      custom: from && to ? `${from} → ${to}` : "Custom range",
    };
    return labels[preset];
  })();

  const netParts = formatMoneyParts(kpis.net);
  const creditParts = formatMoneyParts(receivables.owed);
  const voidedParts = formatMoneyParts(kpis.voidedAmount);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="sf-display text-2xl font-extrabold tracking-tight text-[var(--sf-brand)] sm:text-3xl">
              Receipts & Transactions
            </h1>
            <span className="rounded-md bg-[var(--sf-accent-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--sf-accent-deep)]">
              Live Ledger
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--sf-muted)]">
            Sales, M-Pesa reconciliations, and credit receivables for the selected period.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {checkedIds.size > 0 ? (
            <div className="flex animate-[fadeIn_0.15s_ease] items-center gap-2">
              <span className="rounded-lg bg-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                {checkedIds.size} selected
              </span>
              <button
                type="button"
                onClick={printBatch}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-700"
              >
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Batch
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--sf-border)] bg-white px-4 py-2.5 text-xs font-semibold text-[var(--sf-brand)] shadow-sm hover:bg-[var(--sf-surface-2)]"
            disabled={!displaySales.length}
            onClick={exportCsv}
          >
            Export CSV
          </button>
          <Link
            href="/pos"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--sf-accent)] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[var(--sf-accent-deep)]"
          >
            Make a Sale
            <kbd className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-white/90">
              F2
            </kbd>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--sf-border)] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--sf-muted)]">
              Total Net Sales
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-[var(--sf-brand)]">
            <span className="mr-1 font-sans text-xs font-medium text-slate-400">KSh</span>
            {netParts.whole}
            <span className="text-base text-slate-400">.{netParts.frac}</span>
          </p>
          <div className="mt-3 flex items-center justify-between text-xs text-[var(--sf-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" /> M-Pesa: {kpis.pctMpesa}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-slate-500" /> Cash: {kpis.pctCash}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" /> Credit: {kpis.pctCredit}%
            </span>
          </div>
          <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="bg-emerald-500" style={{ width: `${kpis.pctMpesa}%` }} />
            <div className="bg-slate-500" style={{ width: `${kpis.pctCash}%` }} />
            <div className="bg-amber-500" style={{ width: `${kpis.pctCredit}%` }} />
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--sf-border)] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--sf-muted)]">
              Transactions Count
            </span>
            <span className="grid size-7 place-items-center rounded-lg bg-[var(--sf-accent-soft)] text-[var(--sf-accent-deep)]">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-[var(--sf-brand)]">
            {kpis.count}{" "}
            <span className="font-sans text-sm font-medium text-[var(--sf-muted)]">Receipts</span>
          </p>
          <p className="mt-3 text-xs text-[var(--sf-muted)]">
            Avg Basket:{" "}
            <strong className="font-mono text-[var(--sf-brand)]">{formatKes(kpis.avg)}</strong>
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--sf-border)] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--sf-muted)]">
              Pending Credit
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
              {receivables.debtors} Accounts
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-amber-600">
            <span className="mr-1 font-sans text-xs font-medium text-slate-400">KSh</span>
            {creditParts.whole}
            <span className="text-base text-amber-400">.{creditParts.frac}</span>
          </p>
          <p className="mt-3 flex items-center justify-between text-xs text-[var(--sf-muted)]">
            <span className="truncate pr-2">
              {receivables.names.length ? receivables.names.join(" & ") : "No open balances"}
            </span>
            <Link href="/receivables" className="shrink-0 font-semibold text-amber-600 hover:underline">
              Collect →
            </Link>
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--sf-border)] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--sf-muted)]">
              Money Voided
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
                kpis.voided > 0
                  ? "border-slate-300 bg-slate-100 text-slate-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {kpis.voided} {kpis.voided === 1 ? "receipt" : "receipts"}
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-[var(--sf-brand)]">
            <span className="mr-1 font-sans text-xs font-medium text-slate-400">KSh</span>
            {voidedParts.whole}
            <span className="text-base text-slate-400">.{voidedParts.frac}</span>
          </p>
          <p className="mt-3 flex items-center justify-between text-xs text-[var(--sf-muted)]">
            <span>Credit sales cancelled this period</span>
            <button
              type="button"
              className="shrink-0 font-semibold text-[var(--sf-accent-deep)] hover:underline disabled:opacity-40"
              disabled={kpis.voided === 0}
              onClick={() => {
                setStatusFilter("CANCELLED");
                setQuick("all");
                setMethod("");
              }}
            >
              Show voided →
            </button>
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-[var(--sf-border)] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/60 bg-slate-100 p-1 text-xs font-semibold">
            {periodPresets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`rounded-lg px-3 py-1.5 transition ${
                  preset === p.id
                    ? "bg-white text-[var(--sf-brand)] shadow-sm"
                    : "text-slate-600 hover:text-[var(--sf-brand)]"
                }`}
                onClick={() => applyPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 transition ${
                preset === "all"
                  ? "bg-white text-[var(--sf-brand)] shadow-sm"
                  : "text-slate-600 hover:text-[var(--sf-brand)]"
              }`}
              onClick={() => applyPreset("all")}
            >
              All time
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 transition ${
                preset === "custom"
                  ? "bg-white text-[var(--sf-brand)] shadow-sm"
                  : "text-slate-600 hover:text-[var(--sf-brand)]"
              }`}
              onClick={() => applyPreset("custom")}
            >
              Custom
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--sf-muted)]">
            <svg className="size-4 text-[var(--sf-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>
              Ledger Period:{" "}
              <strong className="font-medium text-[var(--sf-brand)]">{periodLabel}</strong>
            </span>
          </div>
        </div>

        {showCustomDates ? (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--sf-border)] bg-[var(--sf-surface-2)] p-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-[var(--sf-muted)]">
              Start Date
              <input
                type="date"
                className="sf-input mt-1"
                value={from}
                onChange={(e) => {
                  setPreset("custom");
                  setFrom(e.target.value);
                }}
              />
            </label>
            <label className="text-xs font-semibold text-[var(--sf-muted)]">
              End Date
              <input
                type="date"
                className="sf-input mt-1"
                value={to}
                onChange={(e) => {
                  setPreset("custom");
                  setTo(e.target.value);
                }}
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                className="sf-btn sf-btn-accent w-full"
                onClick={() => setShowCustomDates(false)}
              >
                Apply Date Filter
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="relative sm:col-span-2 lg:col-span-5">
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="9" cy="9" r="6" />
              <path d="M14 14l4 4" />
            </svg>
            <input
              type="search"
              className="w-full rounded-xl border border-[var(--sf-border)] bg-[var(--sf-surface-2)] py-2.5 pl-10 pr-9 text-xs text-[var(--sf-brand)] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--sf-accent)]"
              placeholder="Search receipt #, M-Pesa code, customer, product..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="lg:col-span-2">
            <select
              className="w-full appearance-none rounded-xl border border-[var(--sf-border)] bg-[var(--sf-surface-2)] px-3.5 py-2.5 text-xs font-medium text-[var(--sf-brand)]"
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                setQuick("all");
              }}
            >
              <option value="">All Payment Methods</option>
              <option value="CASH">Cash Only</option>
              <option value="MPESA">M-Pesa Only</option>
              <option value="CREDIT">Credit Sales</option>
              <option value="SPLIT">Split Payment</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <select
              className="w-full appearance-none rounded-xl border border-[var(--sf-border)] bg-[var(--sf-surface-2)] px-3.5 py-2.5 text-xs font-medium text-[var(--sf-brand)]"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setQuick("all");
              }}
            >
              <option value="all">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIALLY_REFUNDED">Partially refunded</option>
              <option value="REFUNDED">Refunded</option>
              <option value="CANCELLED">Voided / Cancelled</option>
              <option value="balance_due">Balance due</option>
              <option value="paid">Paid in full (no credit)</option>
              <option value="credit">Credit / on account</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-[var(--sf-border)] bg-[var(--sf-surface-2)] px-2.5 py-1.5 lg:col-span-2">
            <span className="text-[11px] font-bold text-slate-400">KSh</span>
            <input
              type="number"
              min={0}
              placeholder="Min"
              className="w-16 bg-transparent text-xs text-[var(--sf-brand)] placeholder:text-slate-400 focus:outline-none"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
            />
            <span className="text-slate-300">–</span>
            <input
              type="number"
              min={0}
              placeholder="Max"
              className="w-16 bg-transparent text-xs text-[var(--sf-brand)] placeholder:text-slate-400 focus:outline-none"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
            />
          </div>
          <div className="flex justify-end lg:col-span-1">
            <button
              type="button"
              title="Reset all filters"
              className="inline-flex items-center gap-1 py-2 text-xs font-semibold text-[var(--sf-accent)] hover:text-[var(--sf-accent-deep)]"
              onClick={resetFilters}
            >
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Quick Filters:
          </span>
          {(
            [
              { id: "all" as const, label: `All (${counts.all})` },
              { id: "MPESA" as const, label: `M-Pesa (${counts.mpesa})` },
              { id: "CASH" as const, label: `Cash (${counts.cash})` },
              { id: "CREDIT" as const, label: `Credit Accounts (${counts.credit})` },
              { id: "partial" as const, label: `Partial Balance (${counts.partial})` },
            ] as const
          ).map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => applyQuick(pill.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                quick === pill.id
                  ? "border border-orange-200 bg-orange-50 text-orange-800"
                  : "border border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--sf-border)] bg-white shadow-sm">
        <div className="hidden grid-cols-12 items-center gap-3 border-b border-[var(--sf-border)] bg-slate-50/80 px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500 lg:grid">
          <div className="col-span-1 flex items-center gap-3">
            <input
              type="checkbox"
              className="size-4 rounded border-slate-300 text-[var(--sf-accent)] focus:ring-[var(--sf-accent)]"
              checked={allPageChecked}
              onChange={toggleSelectAllPage}
              aria-label="Select all on page"
            />
            <span>Receipt</span>
          </div>
          <div className="col-span-2">Customer & Account</div>
          <div className="col-span-3">Payment Method & Reference</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2 text-right">Total (KSh)</div>
          <div className="col-span-3 text-right">Receipt Actions</div>
        </div>

        {loading ? (
          <p className="px-6 py-16 text-center text-sm text-[var(--sf-muted)]">Loading receipts…</p>
        ) : !paged.length ? (
          <div className="py-16 text-center">
            <h3 className="text-base font-bold text-[var(--sf-brand)]">No matching receipts found</h3>
            <p className="mt-1 text-xs text-[var(--sf-muted)]">
              Try adjusting your search, date range, or payment filters.
            </p>
            <button type="button" className="sf-btn sf-btn-accent mt-4" onClick={resetFilters}>
              Reset filters
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {paged.map((s) => {
              const primary = methodPrimary(s);
              const name = s.customer?.name || "Walk-in Customer";
              const openAmt = openAmountFor(s.id);
              const unpaid = openAmt > 0.009 && Boolean(s.customer?.id);
              const isVoided = s.status === "CANCELLED" || s.status === "VOIDED";
              const isRefunded =
                s.status === "REFUNDED" || s.status === "PARTIALLY_REFUNDED";
              const showVoid = canVoidCredit(s);
              return (
                <li
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(s);
                    }
                  }}
                  className="grid cursor-pointer grid-cols-1 gap-3 px-4 py-4 transition hover:bg-slate-50/80 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-3"
                >
                  <div className="flex items-start gap-3 lg:col-span-1">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 rounded border-slate-300 text-[var(--sf-accent)] focus:ring-[var(--sf-accent)]"
                      checked={checkedIds.has(s.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleChecked(s.id)}
                      aria-label={`Select receipt ${s.receiptNo}`}
                    />
                    <div>
                      <span className="font-mono text-sm font-bold text-[var(--sf-brand)]">
                        #{s.receiptNo}
                      </span>
                      <p className="mt-0.5 text-[10px] text-slate-400 lg:hidden">
                        {new Date(s.completedAt || s.createdAt).toLocaleString("en-KE")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 lg:col-span-2">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                      {initials(name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--sf-brand)]">{name}</p>
                      <p className="truncate text-[11px] text-[var(--sf-muted)]">
                        {new Date(s.completedAt || s.createdAt).toLocaleString("en-KE", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {s.cashier.name}
                      </p>
                    </div>
                  </div>
                  <div className="lg:col-span-3">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${methodBadgeClass(primary)}`}
                    >
                      {methodLabel(primary)}
                    </span>
                    <p className="mt-1 truncate font-mono text-[11px] text-[var(--sf-muted)]">
                      {paymentRef(s)}
                    </p>
                  </div>
                  <div className="lg:col-span-1">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        isVoided
                          ? "bg-slate-100 text-slate-600"
                          : unpaid
                            ? "bg-amber-100 text-amber-900"
                            : s.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : isRefunded
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {isVoided
                        ? "Voided"
                        : unpaid
                          ? "Balance due"
                          : s.status === "COMPLETED"
                            ? "Completed"
                            : s.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="text-left lg:col-span-2 lg:text-right">
                    <p className="font-mono text-sm font-bold text-[var(--sf-brand)]">
                      {formatKes(s.total)}
                    </p>
                    <p className="text-[11px] text-[var(--sf-muted)]">
                      {unpaid ? (
                        <span className="font-semibold text-amber-600">
                          Bal: {formatKes(openAmt)}
                        </span>
                      ) : isVoided ? (
                        "Cancelled"
                      ) : (
                        "Paid in Full"
                      )}
                    </p>
                  </div>
                  <div
                    className="flex items-center justify-start lg:col-span-3 lg:justify-end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isVoided ? (
                      <span className="rounded-xl border border-[var(--sf-border)] bg-slate-50 px-3 py-1.5 text-[11px] font-semibold italic text-slate-400">
                        Voided
                      </span>
                    ) : isRefunded && !unpaid ? (
                      <span className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-500">
                        Refunded
                      </span>
                    ) : unpaid ? (
                      <div className="inline-flex overflow-hidden rounded-xl border border-[var(--sf-border)] bg-white shadow-sm">
                        <button
                          type="button"
                          title="Record Payment"
                          className={`inline-flex items-center gap-1.5 bg-[var(--sf-brand)] px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 ${
                            showVoid ? "border-r border-orange-700" : ""
                          }`}
                          onClick={() => openPayment(s)}
                        >
                          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                          </svg>
                          Pay
                        </button>
                        {showVoid ? (
                          <button
                            type="button"
                            title="Void Credit"
                            className="inline-flex items-center gap-1.5 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                            onClick={() => openVoid(s)}
                          >
                            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            Void Credit
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        title="Refund"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 shadow-sm hover:bg-rose-50"
                        onClick={() => openRefund(s)}
                      >
                        <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        Refund
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--sf-border)] px-4 py-3 text-sm text-[var(--sf-muted)] sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {displaySales.length
                ? `Showing ${pageStart} – ${pageEnd} of ${displaySales.length}`
                : "Showing 0 of 0"}
            </span>
            <label className="flex items-center gap-1.5 text-xs">
              Per page
              <select
                className="rounded-md border border-[var(--sf-border)] bg-white px-2 py-1"
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
      </div>

      {batchReady && settings && checkedSales.length ? (
        <div id="thermal-batch-print" className="pointer-events-none fixed left-[-9999px] top-0">
          {checkedSales.map((s) => (
            <div key={s.id} className="thermal-batch-item">
              <ThermalReceipt id={null} data={receiptData(s)} />
            </div>
          ))}
        </div>
      ) : null}

      {payTarget ? (
        <RecordPaymentModal
          target={payTarget}
          onClose={() => setPayTarget(null)}
          onRecorded={() => {
            load();
            setSelected(null);
          }}
        />
      ) : null}

      {refundTarget ? (
        <ReceiptRefundModal
          sale={refundTarget}
          onClose={() => setRefundTarget(null)}
          onDone={() => {
            load();
            setSelected(null);
          }}
        />
      ) : null}

      {voidTarget ? (
        <VoidCreditModal
          target={voidTarget}
          onClose={() => setVoidTarget(null)}
          onDone={() => {
            load();
            setSelected(null);
          }}
        />
      ) : null}

      {selected && settings && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm no-print"
                onClick={() => setSelected(null)}
                aria-hidden
              />
              <aside
                className="fixed inset-y-0 right-0 z-[100] flex w-full max-w-lg flex-col border-l border-[var(--sf-border)] bg-white shadow-2xl receipt-print-root"
                role="dialog"
                aria-modal="true"
                aria-label={`Receipt ${selected.receiptNo}`}
              >
                {(() => {
                  const balance = openAmountFor(selected.id);
                  const hasBalance = balance > 0.009;
                  const data = receiptData(selected);
                  const printCurrent = () =>
                    receiptView === "a4"
                      ? printA4Invoice()
                      : printThermalReceipt();
                  return (
                    <>
                      <div className="no-print flex items-center justify-between gap-3 border-b border-[var(--sf-border)] bg-slate-50 px-6 py-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-mono text-lg font-bold text-[var(--sf-brand)]">
                              #{selected.receiptNo}
                            </h2>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                hasBalance
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {hasBalance
                                ? `Balance Due: ${formatKes(balance)}`
                                : "Fully Settled"}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--sf-muted)]">
                            {new Date(
                              selected.completedAt || selected.createdAt
                            ).toLocaleString("en-KE")}
                            {" · "}
                            {selected.cashier.name}
                            {selected.customer?.name
                              ? ` · ${selected.customer.name}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            title="Print"
                            className="grid size-9 place-items-center rounded-lg border border-[var(--sf-border)] text-slate-600 hover:bg-slate-100"
                            onClick={printCurrent}
                          >
                            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            aria-label="Close"
                            onClick={() => setSelected(null)}
                          >
                            <IconClose className="size-5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-100/70">
                        <div className="space-y-6 p-6">
                          <div className="no-print flex items-center justify-between gap-2 rounded-xl border border-[var(--sf-border)] bg-white p-1.5 text-xs font-semibold">
                            <span className="pl-2 text-[var(--sf-muted)]">Display Style:</span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className={`rounded-lg px-3 py-1.5 transition ${
                                  receiptView === "thermal"
                                    ? "bg-[var(--sf-brand)] font-bold text-white shadow-sm"
                                    : "text-[var(--sf-muted)] hover:bg-slate-100"
                                }`}
                                onClick={() => setReceiptView("thermal")}
                              >
                                Thermal Slip 80mm
                              </button>
                              <button
                                type="button"
                                className={`rounded-lg px-3 py-1.5 transition ${
                                  receiptView === "a4"
                                    ? "bg-[var(--sf-brand)] font-bold text-white shadow-sm"
                                    : "text-[var(--sf-muted)] hover:bg-slate-100"
                                }`}
                                onClick={() => setReceiptView("a4")}
                              >
                                Commercial Tax A4
                              </button>
                            </div>
                          </div>

                          {receiptView === "thermal" ? (
                            <div className="mx-auto max-w-[340px] rounded-lg border border-slate-200 bg-white p-5 font-mono text-xs shadow-sm">
                              <ThermalReceipt data={data} />
                            </div>
                          ) : (
                            <A4TaxInvoice data={data} openBalance={balance} />
                          )}

                          <div className="no-print space-y-2">
                            <button
                              type="button"
                              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white shadow-lg hover:bg-slate-800"
                              onClick={printCurrent}
                            >
                              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                              {receiptView === "a4"
                                ? "Print Tax Invoice (A4)"
                                : "Print Thermal Slip (80mm)"}
                            </button>

                            <button
                              type="button"
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              onClick={() => {
                                window.open(
                                  `https://wa.me/?text=${encodeURIComponent(receiptPlainText(data))}`,
                                  "_blank",
                                  "noopener,noreferrer"
                                );
                              }}
                            >
                              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                              </svg>
                              Send WhatsApp
                            </button>

                            <div className="flex gap-2 pt-1">
                              <input
                                type="email"
                                className="sf-input flex-1"
                                placeholder="Email address"
                                value={emailTo}
                                onChange={(e) => setEmailTo(e.target.value)}
                              />
                              <button
                                type="button"
                                className="sf-btn sf-btn-ghost"
                                disabled={!emailTo.trim()}
                                onClick={() => emailReceipt(data, emailTo.trim())}
                              >
                                Email
                              </button>
                              <button
                                type="button"
                                className="sf-btn sf-btn-ghost"
                                onClick={() => downloadReceiptPdf(data)}
                              >
                                PDF
                              </button>
                            </div>
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
    </div>
  );
}
