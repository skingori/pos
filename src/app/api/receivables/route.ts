import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canSellCredit } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { roundMoney } from "@/lib/money";

type OpenCharge = {
  saleId: string;
  receiptNo: number;
  customerId: string;
  customerName: string;
  completedAt: string;
  originalCredit: number;
  openAmount: number;
  ageDays: number;
  bucket: "current" | "d31_60" | "d61_90" | "d90_plus";
};

function ageBucket(days: number): OpenCharge["bucket"] {
  if (days <= 30) return "current";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}

function daysBetween(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();

  const now = new Date();

  const customers = await prisma.customer.findMany({
    where: { active: true, balance: { gt: 0 } },
    orderBy: { balance: "desc" },
  });

  const payments = await prisma.customerPayment.findMany({
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const creditSales = await prisma.sale.findMany({
    where: {
      status: { in: ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"] },
      customerId: { not: null },
      payments: { some: { method: "CREDIT", status: "PAID" } },
    },
    include: {
      customer: true,
      payments: { where: { method: "CREDIT", status: "PAID" } },
    },
    orderBy: { completedAt: "asc" },
  });

  const collectionsByCustomer = await prisma.customerPayment.groupBy({
    by: ["customerId"],
    _sum: { amount: true },
  });
  const collectedMap = Object.fromEntries(
    collectionsByCustomer.map((c) => [c.customerId, c._sum.amount || 0])
  );

  // FIFO: apply collections to oldest credit charges first → remaining open charges
  const chargesByCustomer: Record<
    string,
    { receiptNo: number; saleId: string; completedAt: Date; amount: number }[]
  > = {};

  for (const sale of creditSales) {
    if (!sale.customerId || !sale.customer) continue;
    const creditAmt = roundMoney(
      sale.payments.reduce((s, p) => s + p.amount, 0)
    );
    if (creditAmt <= 0) continue;
    if (!chargesByCustomer[sale.customerId]) chargesByCustomer[sale.customerId] = [];
    chargesByCustomer[sale.customerId].push({
      saleId: sale.id,
      receiptNo: sale.receiptNo,
      completedAt: sale.completedAt || sale.createdAt,
      amount: creditAmt,
    });
  }

  const openCharges: OpenCharge[] = [];
  for (const [customerId, charges] of Object.entries(chargesByCustomer)) {
    let remainingCollections = roundMoney(collectedMap[customerId] || 0);
    const customerName =
      creditSales.find((s) => s.customerId === customerId)?.customer?.name || "Customer";

    for (const charge of charges) {
      let open = charge.amount;
      if (remainingCollections > 0) {
        const applied = Math.min(open, remainingCollections);
        open = roundMoney(open - applied);
        remainingCollections = roundMoney(remainingCollections - applied);
      }
      if (open <= 0.009) continue;
      const ageDays = daysBetween(charge.completedAt, now);
      openCharges.push({
        saleId: charge.saleId,
        receiptNo: charge.receiptNo,
        customerId,
        customerName,
        completedAt: charge.completedAt.toISOString(),
        originalCredit: charge.amount,
        openAmount: open,
        ageDays,
        bucket: ageBucket(ageDays),
      });
    }
  }

  const aging = {
    current: roundMoney(
      openCharges.filter((c) => c.bucket === "current").reduce((s, c) => s + c.openAmount, 0)
    ),
    d31_60: roundMoney(
      openCharges.filter((c) => c.bucket === "d31_60").reduce((s, c) => s + c.openAmount, 0)
    ),
    d61_90: roundMoney(
      openCharges.filter((c) => c.bucket === "d61_90").reduce((s, c) => s + c.openAmount, 0)
    ),
    d90_plus: roundMoney(
      openCharges
        .filter((c) => c.bucket === "d90_plus")
        .reduce((s, c) => s + c.openAmount, 0)
    ),
  };

  const owed = roundMoney(customers.reduce((s, c) => s + c.balance, 0));
  const overdue = roundMoney(aging.d31_60 + aging.d61_90 + aging.d90_plus);

  const customersWithAging = customers.map((c) => {
    const theirs = openCharges.filter((o) => o.customerId === c.id);
    return {
      ...c,
      openReceipts: theirs.length,
      aging: {
        current: roundMoney(
          theirs.filter((o) => o.bucket === "current").reduce((s, o) => s + o.openAmount, 0)
        ),
        d31_60: roundMoney(
          theirs.filter((o) => o.bucket === "d31_60").reduce((s, o) => s + o.openAmount, 0)
        ),
        d61_90: roundMoney(
          theirs.filter((o) => o.bucket === "d61_90").reduce((s, o) => s + o.openAmount, 0)
        ),
        d90_plus: roundMoney(
          theirs.filter((o) => o.bucket === "d90_plus").reduce((s, o) => s + o.openAmount, 0)
        ),
      },
      charges: theirs,
    };
  });

  return NextResponse.json({
    asOf: now.toISOString(),
    summary: {
      owed,
      overdue,
      debtors: customers.length,
      openReceipts: openCharges.length,
      aging,
    },
    customers: customersWithAging,
    openCharges,
    payments,
  });
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canSellCredit(user.role)) return forbidden();

  const body = await req.json();
  const amount = roundMoney(Number(body.amount));
  if (amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (amount > customer.balance) {
    return NextResponse.json({ error: "Amount exceeds balance" }, { status: 400 });
  }

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.customerPayment.create({
      data: {
        customerId: customer.id,
        amount,
        method: body.method === "MPESA" ? "MPESA" : "CASH",
        note: body.note || null,
      },
    });
    await tx.customer.update({
      where: { id: customer.id },
      data: { balance: { decrement: amount } },
    });
    return p;
  });

  await writeAudit({
    userId: user.id,
    action: "RECEIVABLE_PAYMENT",
    entity: "Customer",
    entityId: customer.id,
    detail: `${amount}`,
  });

  return NextResponse.json(payment, { status: 201 });
}
