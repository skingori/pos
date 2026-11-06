import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canSellCredit } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { roundMoney } from "@/lib/money";
import { PaymentMethod } from "@prisma/client";
import { postCustomerPaymentJournal } from "@/lib/gl";
import { getCustomerOpenCharges, reconcileCustomerBalance } from "@/lib/customer-account";

type AgingBucket = "current" | "d31_60" | "d61_90" | "d90_plus";

function ageBucket(days: number): AgingBucket {
  if (days <= 30) return "current";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}

const PAY_METHODS = new Set(["CASH", "MPESA", "CARD", "BANK"]);

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();

  const now = new Date();
  const customers = await prisma.customer.findMany({
    where: { active: true, balance: { gt: 0 } },
    orderBy: { balance: "desc" },
  });

  const payments = await prisma.customerPayment.findMany({
    where: { isWriteOff: false },
    include: { customer: true, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const customersWithAging = [];
  const allOpen: {
    saleId: string;
    receiptNo: number;
    customerId: string;
    customerName: string;
    completedAt: string;
    dueAt: string | null;
    originalCredit: number;
    openAmount: number;
    ageDays: number;
    bucket: AgingBucket;
    isOverdue: boolean;
  }[] = [];

  for (const c of customers) {
    const charges = await getCustomerOpenCharges(c.id);
    const mapped = charges.map((ch) => {
      const isOverdue = Boolean(ch.dueAt && new Date(ch.dueAt) < now);
      return {
        saleId: ch.saleId,
        receiptNo: ch.receiptNo,
        customerId: c.id,
        customerName: c.name,
        completedAt: ch.completedAt,
        dueAt: ch.dueAt,
        originalCredit: ch.originalCredit,
        openAmount: ch.openAmount,
        ageDays: ch.ageDays,
        bucket: ageBucket(ch.ageDays),
        isOverdue,
      };
    });
    allOpen.push(...mapped);
    customersWithAging.push({
      ...c,
      openReceipts: mapped.length,
      aging: {
        current: roundMoney(
          mapped.filter((o) => o.bucket === "current").reduce((s, o) => s + o.openAmount, 0)
        ),
        d31_60: roundMoney(
          mapped.filter((o) => o.bucket === "d31_60").reduce((s, o) => s + o.openAmount, 0)
        ),
        d61_90: roundMoney(
          mapped.filter((o) => o.bucket === "d61_90").reduce((s, o) => s + o.openAmount, 0)
        ),
        d90_plus: roundMoney(
          mapped.filter((o) => o.bucket === "d90_plus").reduce((s, o) => s + o.openAmount, 0)
        ),
      },
      charges: mapped,
    });
  }

  const aging = {
    current: roundMoney(
      allOpen.filter((c) => c.bucket === "current").reduce((s, c) => s + c.openAmount, 0)
    ),
    d31_60: roundMoney(
      allOpen.filter((c) => c.bucket === "d31_60").reduce((s, c) => s + c.openAmount, 0)
    ),
    d61_90: roundMoney(
      allOpen.filter((c) => c.bucket === "d61_90").reduce((s, c) => s + c.openAmount, 0)
    ),
    d90_plus: roundMoney(
      allOpen.filter((c) => c.bucket === "d90_plus").reduce((s, c) => s + c.openAmount, 0)
    ),
  };

  const overdueCharges = allOpen.filter((c) => c.isOverdue);
  const owed = roundMoney(customers.reduce((s, c) => s + c.balance, 0));

  return NextResponse.json({
    asOf: now.toISOString(),
    summary: {
      owed,
      overdue: roundMoney(overdueCharges.reduce((s, c) => s + c.openAmount, 0)),
      overdueReceipts: overdueCharges.length,
      debtors: customers.length,
      openReceipts: allOpen.length,
      aging,
    },
    customers: customersWithAging,
    openCharges: allOpen,
    payments,
  });
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canSellCredit(user.role)) return forbidden();

  const body = await req.json();
  const amount = roundMoney(Number(body.amount));
  const isWriteOff = Boolean(body.isWriteOff);
  if (amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const methodRaw = String(body.method || "CASH").toUpperCase();
  if (!isWriteOff && !PAY_METHODS.has(methodRaw)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }
  const method = (isWriteOff ? "CASH" : methodRaw) as PaymentMethod;

  const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
  if (!customer || !customer.active) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  if (isWriteOff && (!body.note || !String(body.note).trim())) {
    return NextResponse.json({ error: "Write-off requires a reason" }, { status: 400 });
  }

  const previousBalance = roundMoney(customer.balance);
  if (isWriteOff && amount > previousBalance + 0.009) {
    return NextResponse.json(
      { error: "Write-off cannot exceed outstanding balance" },
      { status: 400 }
    );
  }

  const saleId =
    !isWriteOff && typeof body.saleId === "string" && body.saleId.trim()
      ? body.saleId.trim()
      : null;
  // Excess over the targeted receipt settles other open receipts oldest first,
  // then remains as store credit for future credit sales.
  if (saleId) {
    const open = await getCustomerOpenCharges(customer.id);
    if (!open.some((c) => c.saleId === saleId)) {
      return NextResponse.json(
        { error: "That receipt has no open credit balance" },
        { status: 400 }
      );
    }
  }

  const appliedToDebt = roundMoney(Math.min(Math.max(0, previousBalance), amount));
  const excessCredit = isWriteOff ? 0 : roundMoney(Math.max(0, amount - appliedToDebt));

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.customerPayment.create({
      data: {
        customerId: customer.id,
        saleId,
        amount,
        method,
        note: body.note || null,
        isWriteOff,
        userId: user.id,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        user: { select: { name: true } },
        sale: { select: { id: true, receiptNo: true } },
      },
    });
    await postCustomerPaymentJournal(tx, {
      id: p.id,
      receiptNo: p.receiptNo,
      amount: p.amount,
      method: p.method,
      customerName: customer.name,
      isWriteOff,
    });
    return p;
  });

  const newBalance = await reconcileCustomerBalance(customer.id);

  await writeAudit({
    userId: user.id,
    action: isWriteOff ? "CREDIT_WRITE_OFF" : "RECEIVABLE_PAYMENT",
    entity: "CustomerPayment",
    entityId: payment.id,
    detail: `${customer.name} ${amount}`,
  });

  return NextResponse.json(
    {
      ...payment,
      previousBalance,
      appliedToDebt,
      excessCredit,
      newBalance,
    },
    { status: 201 }
  );
}
