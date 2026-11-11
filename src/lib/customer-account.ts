import { prisma } from "./prisma";
import { roundMoney } from "./money";
import { postCustomerPaymentJournal } from "./gl";

export type OpenCharge = {
  saleId: string;
  receiptNo: number;
  completedAt: string;
  dueAt: string | null;
  originalCredit: number;
  openAmount: number;
  total: number;
  ageDays: number;
};

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

/** FIFO untargeted collections; sale-targeted payments hit that receipt first. */
export async function getCustomerOpenCharges(customerId: string): Promise<OpenCharge[]> {
  const now = new Date();
  const [sales, payments, refunds] = await Promise.all([
    prisma.sale.findMany({
      where: {
        customerId,
        status: { in: ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"] },
        payments: { some: { method: "CREDIT", status: "PAID" } },
      },
      include: {
        payments: { where: { method: "CREDIT", status: "PAID" } },
      },
      // Oldest sale first so newer credit stays open until earlier balances clear.
      orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.customerPayment.findMany({
      where: { customerId },
      select: { amount: true, saleId: true, isStoreCreditReversal: true },
    }),
    prisma.refundRequest.findMany({
      where: {
        status: "APPROVED",
        payoutMethod: "CREDIT",
        sale: { customerId },
      },
      select: { saleId: true, amount: true },
    }),
  ]);

  const creditedBySale = new Map<string, number>();
  for (const sale of sales) {
    creditedBySale.set(
      sale.id,
      roundMoney(sale.payments.reduce((s, p) => s + p.amount, 0))
    );
  }

  // Credit refunds reduce that sale's credit first. Leftover (e.g. CREDIT refund on a
  // cash sale) is store credit and FIFO-applies like a collection.
  const refundedBySale = new Map<string, number>();
  let storeCreditFromRefunds = 0;
  for (const r of refunds) {
    const credited = creditedBySale.get(r.saleId) || 0;
    const already = refundedBySale.get(r.saleId) || 0;
    const room = roundMoney(Math.max(0, credited - already));
    const toSale = Math.min(room, r.amount);
    if (toSale > 0) {
      refundedBySale.set(r.saleId, roundMoney(already + toSale));
    }
    storeCreditFromRefunds = roundMoney(
      storeCreditFromRefunds + Math.max(0, r.amount - toSale)
    );
  }

  const targetedBySale = new Map<string, number>();
  let untargeted = storeCreditFromRefunds;
  for (const p of payments) {
    // Store-credit reductions do not settle open receipts.
    if (p.isStoreCreditReversal) continue;
    if (p.saleId && creditedBySale.has(p.saleId)) {
      targetedBySale.set(
        p.saleId,
        roundMoney((targetedBySale.get(p.saleId) || 0) + p.amount)
      );
    } else {
      untargeted = roundMoney(untargeted + p.amount);
    }
  }

  // Apply targeted payments to their sale; overflow joins untargeted FIFO pool.
  const afterTarget = new Map<string, number>();
  for (const sale of sales) {
    const credited = creditedBySale.get(sale.id) || 0;
    const refunded = refundedBySale.get(sale.id) || 0;
    let openAmt = roundMoney(Math.max(0, credited - refunded));
    const targeted = targetedBySale.get(sale.id) || 0;
    if (targeted > 0) {
      const applied = Math.min(openAmt, targeted);
      openAmt = roundMoney(openAmt - applied);
      untargeted = roundMoney(untargeted + Math.max(0, targeted - applied));
    }
    afterTarget.set(sale.id, openAmt);
  }

  let remaining = untargeted;
  const open: OpenCharge[] = [];

  for (const sale of sales) {
    let openAmt = afterTarget.get(sale.id) || 0;
    if (openAmt <= 0.009) continue;
    const credited = creditedBySale.get(sale.id) || 0;
    const refunded = refundedBySale.get(sale.id) || 0;
    const creditAmt = roundMoney(Math.max(0, credited - refunded));
    if (remaining > 0) {
      const applied = Math.min(openAmt, remaining);
      openAmt = roundMoney(openAmt - applied);
      remaining = roundMoney(remaining - applied);
    }
    if (openAmt <= 0.009) continue;
    const soldAt = sale.completedAt || sale.createdAt;
    const ageDays = sale.creditDueAt
      ? daysBetween(sale.creditDueAt, now)
      : daysBetween(soldAt, now);
    open.push({
      saleId: sale.id,
      receiptNo: sale.receiptNo,
      completedAt: soldAt.toISOString(),
      dueAt: sale.creditDueAt?.toISOString() || null,
      originalCredit: creditAmt,
      openAmount: openAmt,
      total: sale.total,
      ageDays,
    });
  }
  return open;
}

/** Closing balance from the statement — source of truth for what the customer owes. */
export async function getLedgerClosingBalance(customerId: string): Promise<number> {
  const ledger = await buildCustomerLedger(customerId);
  const closing = ledger.find((e) => e.type === "CLOSING");
  return roundMoney(closing?.balanceAfter ?? 0);
}

/** Keep stored customer.balance aligned with the statement closing balance. */
export async function reconcileCustomerBalance(
  customerId: string,
  knownClosing?: number
): Promise<number> {
  const closing =
    knownClosing != null ? roundMoney(knownClosing) : await getLedgerClosingBalance(customerId);
  await prisma.customer.update({
    where: { id: customerId },
    data: { balance: closing },
  });
  return closing;
}

export type LedgerEntry = {
  id: string;
  at: string;
  type:
    | "CREDIT_SALE"
    | "PAYMENT"
    | "WRITE_OFF"
    | "CREDIT_REFUND"
    | "STORE_CREDIT_REVERSAL"
    | "OPENING"
    | "CLOSING";
  label: string;
  ref: string;
  detail: string | null;
  owed: number;
  paid: number;
  balanceAfter: number;
};

/** Set absolute prepaid store credit when the account has no outstanding debt. */
export async function setCustomerStoreCredit(opts: {
  customerId: string;
  targetCredit: number;
  userId: string;
  method?: "CASH" | "MPESA" | "BANK";
  note?: string | null;
}): Promise<{ previousCredit: number; newCredit: number; delta: number }> {
  const target = roundMoney(Math.max(0, opts.targetCredit));
  const closing = await getLedgerClosingBalance(opts.customerId);
  const owed = Math.max(0, closing);
  const previousCredit = Math.max(0, -closing);
  if (owed > 0.009) {
    throw new Error(
      "Clear outstanding balance before editing store credit, or use Record payment so excess becomes credit."
    );
  }
  const delta = roundMoney(target - previousCredit);
  if (Math.abs(delta) <= 0.009) {
    return { previousCredit, newCredit: previousCredit, delta: 0 };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: opts.customerId },
    select: { name: true },
  });
  if (!customer) throw new Error("Customer not found");

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.customerPayment.create({
      data: {
        customerId: opts.customerId,
        amount: Math.abs(delta),
        method: opts.method || "CASH",
        note:
          opts.note ||
          (delta > 0 ? "Store credit deposit" : "Store credit reduction"),
        isWriteOff: false,
        isStoreCreditReversal: delta < 0,
        userId: opts.userId,
      },
    });
    await postCustomerPaymentJournal(tx, {
      id: p.id,
      receiptNo: p.receiptNo,
      amount: p.amount,
      method: p.method,
      customerName: customer.name,
      isWriteOff: false,
      isStoreCreditReversal: p.isStoreCreditReversal,
    });
    return p;
  });

  void payment;
  const newBalance = await reconcileCustomerBalance(opts.customerId);
  return {
    previousCredit,
    newCredit: Math.max(0, -newBalance),
    delta,
  };
}

/**
 * Statement lines matching Stockflow: credit sales, then each payment/write-off
 * split FIFO across receipts (one ledger row per receipt touched).
 */
export async function buildCustomerLedger(customerId: string): Promise<LedgerEntry[]> {
  const [sales, payments, refunds] = await Promise.all([
    prisma.sale.findMany({
      where: {
        customerId,
        status: { in: ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"] },
        payments: { some: { method: "CREDIT", status: "PAID" } },
      },
      include: { payments: { where: { method: "CREDIT", status: "PAID" } } },
      orderBy: { completedAt: "asc" },
    }),
    prisma.customerPayment.findMany({
      where: { customerId },
      include: {
        user: { select: { name: true } },
        sale: { select: { id: true, receiptNo: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.refundRequest.findMany({
      where: {
        status: "APPROVED",
        payoutMethod: "CREDIT",
        sale: { customerId },
      },
      include: { sale: { select: { receiptNo: true } } },
      orderBy: { reviewedAt: "asc" },
    }),
  ]);

  type Event =
    | {
        kind: "sale";
        at: Date;
        id: string;
        receiptNo: number;
        amount: number;
        dueAt: Date | null;
      }
    | {
        kind: "pay";
        at: Date;
        id: string;
        receiptNo: number;
        amount: number;
        method: string;
        isWriteOff: boolean;
        isStoreCreditReversal: boolean;
        note: string | null;
        userName: string | null;
        targetSaleId: string | null;
        targetReceiptNo: number | null;
      }
    | {
        kind: "refund";
        at: Date;
        id: string;
        receiptNo: number;
        amount: number;
        reason: string | null;
      };

  const events: Event[] = [];

  for (const sale of sales) {
    const amt = roundMoney(sale.payments.reduce((s, p) => s + p.amount, 0));
    if (amt <= 0) continue;
    events.push({
      kind: "sale",
      at: sale.completedAt || sale.createdAt,
      id: sale.id,
      receiptNo: sale.receiptNo,
      amount: amt,
      dueAt: sale.creditDueAt,
    });
  }
  for (const p of payments) {
    events.push({
      kind: "pay",
      at: p.createdAt,
      id: p.id,
      receiptNo: p.receiptNo,
      amount: p.amount,
      method: p.method,
      isWriteOff: p.isWriteOff,
      isStoreCreditReversal: Boolean(p.isStoreCreditReversal),
      note: p.note,
      userName: p.user?.name || null,
      targetSaleId: p.saleId || null,
      targetReceiptNo: p.sale?.receiptNo ?? null,
    });
  }
  for (const r of refunds) {
    events.push({
      kind: "refund",
      at: r.reviewedAt || r.createdAt,
      id: r.id,
      receiptNo: r.sale.receiptNo,
      amount: r.amount,
      reason: r.reason,
    });
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));

  // Open credit buckets in sale order for FIFO allocation
  type Bucket = { saleId: string; receiptNo: number; remaining: number };
  const buckets: Bucket[] = [];
  const entries: LedgerEntry[] = [];
  let running = 0;

  entries.push({
    id: "opening",
    at: "",
    type: "OPENING",
    label: "Opening balance",
    ref: "",
    detail: null,
    owed: 0,
    paid: 0,
    balanceAfter: 0,
  });

  for (const ev of events) {
    if (ev.kind === "sale") {
      running = roundMoney(running + ev.amount);
      buckets.push({ saleId: ev.id, receiptNo: ev.receiptNo, remaining: ev.amount });
      const due = ev.dueAt ? `due ${ev.dueAt.toISOString().slice(0, 10)}` : null;
      entries.push({
        id: `sale-${ev.id}`,
        at: ev.at.toISOString(),
        type: "CREDIT_SALE",
        label: "Credit sale",
        ref: `Receipt #${ev.receiptNo}`,
        detail: due ? `Credit sale, ${due}` : "Credit sale",
        owed: ev.amount,
        paid: 0,
        balanceAfter: running,
      });
      continue;
    }

    if (ev.kind === "refund") {
      running = roundMoney(running - ev.amount);
      // reduce newest buckets first for refunds of credit
      let left = ev.amount;
      for (let i = buckets.length - 1; i >= 0 && left > 0.009; i--) {
        const take = Math.min(buckets[i].remaining, left);
        buckets[i].remaining = roundMoney(buckets[i].remaining - take);
        left = roundMoney(left - take);
      }
      entries.push({
        id: `refund-${ev.id}`,
        at: ev.at.toISOString(),
        type: "CREDIT_REFUND",
        label: "Credit refund",
        ref: `Sale #${ev.receiptNo}`,
        detail: ev.reason || "Credit refund",
        owed: 0,
        paid: ev.amount,
        balanceAfter: running,
      });
      continue;
    }

    if (ev.isStoreCreditReversal) {
      running = roundMoney(running + ev.amount);
      entries.push({
        id: `pay-${ev.id}-0`,
        at: ev.at.toISOString(),
        type: "STORE_CREDIT_REVERSAL",
        label: "Credit used",
        ref: `Adjustment #${ev.receiptNo}`,
        detail: ev.note || "Store credit reduction",
        owed: ev.amount,
        paid: 0,
        balanceAfter: running,
      });
      continue;
    }

    // Payment / write-off: target sale first when set, then FIFO
    let left = ev.amount;
    const touched: { receiptNo: number; amount: number }[] = [];
    if (ev.targetSaleId) {
      const target = buckets.find((b) => b.saleId === ev.targetSaleId);
      if (target && target.remaining > 0.009 && left > 0.009) {
        const take = Math.min(target.remaining, left);
        target.remaining = roundMoney(target.remaining - take);
        left = roundMoney(left - take);
        touched.push({ receiptNo: target.receiptNo, amount: take });
      }
    }
    for (const b of buckets) {
      if (left <= 0.009) break;
      if (b.remaining <= 0.009) continue;
      if (ev.targetSaleId && b.saleId === ev.targetSaleId) continue;
      const take = Math.min(b.remaining, left);
      b.remaining = roundMoney(b.remaining - take);
      left = roundMoney(left - take);
      touched.push({ receiptNo: b.receiptNo, amount: take });
    }
    // Excess / prepaid with no open receipt
    if (left > 0.009) {
      touched.push({ receiptNo: 0, amount: left });
    }

    if (!touched.length) {
      touched.push({
        receiptNo: ev.targetReceiptNo || 0,
        amount: ev.amount,
      });
    }

    let stepRunning = running;
    touched.forEach((t, idx) => {
      stepRunning = roundMoney(stepRunning - t.amount);
      const methodLabel = ev.method.toLowerCase();
      const detail = ev.isWriteOff
        ? t.receiptNo
          ? `Write-off applied to receipt #${t.receiptNo}`
          : ev.note || "Write-off"
        : t.receiptNo
          ? `Payment (${methodLabel}) applied to receipt #${t.receiptNo}`
          : `Payment (${methodLabel}) — store credit`;
      entries.push({
        id: `pay-${ev.id}-${idx}`,
        at: ev.at.toISOString(),
        type: ev.isWriteOff ? "WRITE_OFF" : "PAYMENT",
        label: ev.isWriteOff ? "Write-off" : "Payment",
        ref: ev.isWriteOff ? `Write-off #${ev.receiptNo}` : `Payment #${ev.receiptNo}`,
        detail,
        owed: 0,
        paid: t.amount,
        balanceAfter: stepRunning,
      });
    });
    running = stepRunning;
  }

  entries.push({
    id: "closing",
    at: "",
    type: "CLOSING",
    label: "Closing balance",
    ref: "",
    detail: null,
    owed: 0,
    paid: 0,
    balanceAfter: running,
  });

  return entries;
}
