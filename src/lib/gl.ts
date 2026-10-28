import { prisma } from "./prisma";
import { roundMoney } from "./money";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

const CODES = {
  CASH: "1000",
  MPESA: "1010",
  CARD: "1020",
  BANK: "1030",
  AR: "1100",
  INVENTORY: "1200",
  VAT: "2100",
  EQUITY: "3000",
  SALES: "4000",
  COGS: "5000",
  REFUND_EXP: "5200",
  WRITE_OFF: "5300",
} as const;

export async function ensureChartOfAccounts(tx: Tx = prisma) {
  const accounts: {
    code: string;
    name: string;
    type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" | "COGS";
  }[] = [
    { code: CODES.CASH, name: "Cash on hand", type: "ASSET" },
    { code: CODES.MPESA, name: "M-Pesa", type: "ASSET" },
    { code: CODES.CARD, name: "Card / POS bank", type: "ASSET" },
    { code: CODES.BANK, name: "Bank transfer clearing", type: "ASSET" },
    { code: CODES.AR, name: "Accounts receivable", type: "ASSET" },
    { code: CODES.INVENTORY, name: "Inventory", type: "ASSET" },
    { code: CODES.VAT, name: "VAT payable", type: "LIABILITY" },
    { code: CODES.EQUITY, name: "Owner equity / cash float", type: "EQUITY" },
    { code: CODES.SALES, name: "Sales revenue", type: "INCOME" },
    { code: CODES.COGS, name: "Cost of goods sold", type: "COGS" },
    { code: CODES.REFUND_EXP, name: "Sales returns", type: "EXPENSE" },
    { code: CODES.WRITE_OFF, name: "Inventory write-off", type: "EXPENSE" },
  ];
  for (const a of accounts) {
    await tx.account.upsert({
      where: { code: a.code },
      update: { name: a.name, type: a.type },
      create: a,
    });
  }
}

async function accountId(tx: Tx, code: string) {
  const a = await tx.account.findUnique({ where: { code } });
  if (!a) throw new Error(`Missing GL account ${code}`);
  return a.id;
}

export async function postJournal(
  tx: Tx,
  opts: {
    memo: string;
    sourceType: string;
    sourceId?: string;
    lines: { code: string; debit?: number; credit?: number }[];
  }
) {
  await ensureChartOfAccounts(tx);
  const existing = opts.sourceId
    ? await tx.journalEntry.findFirst({
        where: { sourceType: opts.sourceType, sourceId: opts.sourceId },
      })
    : null;
  if (existing) return existing;

  const prepared = [];
  let debits = 0;
  let credits = 0;
  for (const line of opts.lines) {
    const debit = roundMoney(line.debit || 0);
    const credit = roundMoney(line.credit || 0);
    if (debit === 0 && credit === 0) continue;
    debits = roundMoney(debits + debit);
    credits = roundMoney(credits + credit);
    prepared.push({
      accountId: await accountId(tx, line.code),
      debit,
      credit,
    });
  }
  if (!prepared.length) return null;
  if (Math.abs(debits - credits) > 0.02) {
    throw new Error(`Unbalanced journal: DR ${debits} CR ${credits} (${opts.memo})`);
  }

  return tx.journalEntry.create({
    data: {
      memo: opts.memo,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
      lines: { create: prepared },
    },
  });
}

export async function postSaleJournal(
  tx: Tx,
  sale: {
    id: string;
    receiptNo: number;
    total: number;
    taxAmount: number;
    costTotal: number;
    payments: { method: string; amount: number; status: string }[];
  }
) {
  const lines: { code: string; debit?: number; credit?: number }[] = [];
  for (const p of sale.payments) {
    if (p.status !== "PAID") continue;
    const code =
      p.method === "CASH"
        ? CODES.CASH
        : p.method === "MPESA"
          ? CODES.MPESA
          : p.method === "CARD"
            ? CODES.CARD
            : p.method === "BANK"
              ? CODES.BANK
              : CODES.AR;
    lines.push({ code, debit: p.amount });
  }
  const netSales = roundMoney(sale.total - (sale.taxAmount || 0));
  lines.push({ code: CODES.SALES, credit: netSales });
  if (sale.taxAmount > 0) lines.push({ code: CODES.VAT, credit: sale.taxAmount });
  if (sale.costTotal > 0) {
    lines.push({ code: CODES.COGS, debit: sale.costTotal });
    lines.push({ code: CODES.INVENTORY, credit: sale.costTotal });
  }
  return postJournal(tx, {
    memo: `Sale receipt #${sale.receiptNo}`,
    sourceType: "Sale",
    sourceId: sale.id,
    lines,
  });
}

export async function postPurchaseJournal(
  tx: Tx,
  purchase: { id: string; totalCost: number }
) {
  if (purchase.totalCost <= 0) return null;
  return postJournal(tx, {
    memo: `Stock purchase ${purchase.id.slice(0, 8)}`,
    sourceType: "Purchase",
    sourceId: purchase.id,
    lines: [
      { code: CODES.INVENTORY, debit: purchase.totalCost },
      { code: CODES.CASH, credit: purchase.totalCost },
    ],
  });
}

export async function postRefundJournal(
  tx: Tx,
  refund: {
    id: string;
    amount: number;
    payoutMethod: string;
    costReturned: number;
    writeOffCost: number;
    receiptNo: number;
  }
) {
  const lines: { code: string; debit?: number; credit?: number }[] = [];
  lines.push({ code: CODES.REFUND_EXP, debit: refund.amount });
  if (refund.payoutMethod === "CASH") lines.push({ code: CODES.CASH, credit: refund.amount });
  else if (refund.payoutMethod === "MPESA") lines.push({ code: CODES.MPESA, credit: refund.amount });
  else lines.push({ code: CODES.AR, credit: refund.amount });

  if (refund.costReturned > 0) {
    lines.push({ code: CODES.INVENTORY, debit: refund.costReturned });
    lines.push({ code: CODES.COGS, credit: refund.costReturned });
  }
  if (refund.writeOffCost > 0) {
    lines.push({ code: CODES.WRITE_OFF, debit: refund.writeOffCost });
    lines.push({ code: CODES.INVENTORY, credit: refund.writeOffCost });
  }

  return postJournal(tx, {
    memo: `Refund receipt #${refund.receiptNo}`,
    sourceType: "Refund",
    sourceId: refund.id,
    lines,
  });
}

export async function postCashMovementJournal(
  tx: Tx,
  movement: { id: string; type: "IN" | "OUT"; amount: number; note?: string | null }
) {
  if (movement.amount <= 0) return null;
  if (movement.type === "IN") {
    return postJournal(tx, {
      memo: movement.note || "Cash in",
      sourceType: "CashMovement",
      sourceId: movement.id,
      lines: [
        { code: CODES.CASH, debit: movement.amount },
        { code: CODES.EQUITY, credit: movement.amount },
      ],
    });
  }
  return postJournal(tx, {
    memo: movement.note || "Cash out",
    sourceType: "CashMovement",
    sourceId: movement.id,
    lines: [
      { code: CODES.EQUITY, debit: movement.amount },
      { code: CODES.CASH, credit: movement.amount },
    ],
  });
}

export { CODES };
