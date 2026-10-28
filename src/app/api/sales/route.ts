import { NextRequest, NextResponse } from "next/server";
import { prisma, withTransaction } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canChangePrice, canSellCredit } from "@/lib/permissions";
import { roundMoney } from "@/lib/money";
import { initiateStkPush } from "@/lib/mpesa";
import { writeAudit } from "@/lib/audit";
import { completePendingSale } from "@/lib/sales";
import { getShopSettings } from "@/lib/settings";
import { computeTax } from "@/lib/tax";
import { postSaleJournal } from "@/lib/gl";
import { parseSerials, sellSerials } from "@/lib/serials";
import { PaymentMethod, PaymentStatus, SaleStatus } from "@prisma/client";
import { resolveBranchId } from "@/lib/branch";
import { adjustQty, getOrCreateStock } from "@/lib/branch-stock";

type CartLine = {
  productId: string;
  qty: number;
  unitPrice?: number;
  discount?: number;
  serials?: string[] | string;
};

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const from = sp.get("from");
  const to = sp.get("to");
  const method = sp.get("method")?.toUpperCase();
  const credit = sp.get("credit"); // all | credit | paid
  const minAmount = sp.get("minAmount");
  const maxAmount = sp.get("maxAmount");
  const take = Math.min(Math.max(Number(sp.get("take") || 200) || 200, 1), 500);

  const dateFilter =
    from || to
      ? {
          completedAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
          },
        }
      : {};

  const amountFilter =
    minAmount || maxAmount
      ? {
          total: {
            ...(minAmount != null && minAmount !== ""
              ? { gte: Number(minAmount) }
              : {}),
            ...(maxAmount != null && maxAmount !== ""
              ? { lte: Number(maxAmount) }
              : {}),
          },
        }
      : {};

  const methodFilter =
    method && ["CASH", "MPESA", "CREDIT"].includes(method)
      ? { payments: { some: { method: method as PaymentMethod } } }
      : {};

  const creditFilter =
    credit === "credit"
      ? { payments: { some: { method: "CREDIT" as PaymentMethod } } }
      : credit === "paid"
        ? { payments: { none: { method: "CREDIT" as PaymentMethod } } }
        : {};

  const searchFilter = q
    ? {
        OR: [
          { customer: { name: { contains: q } } },
          { cashier: { name: { contains: q } } },
          { lines: { some: { name: { contains: q } } } },
          { payments: { some: { mpesaReceipt: { contains: q } } } },
          ...(Number.isFinite(Number(q)) ? [{ receiptNo: Number(q) }] : []),
        ],
      }
    : {};

  const sales = await prisma.sale.findMany({
    where: {
      status: { in: ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"] },
      ...dateFilter,
      ...amountFilter,
      ...methodFilter,
      ...creditFilter,
      ...searchFilter,
    },
    include: {
      customer: true,
      cashier: true,
      lines: true,
      payments: true,
    },
    orderBy: { completedAt: "desc" },
    take,
  });
  return NextResponse.json(sales);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const lines: CartLine[] = body.lines || [];
  const customerId: string | undefined = body.customerId || undefined;
  const discount = roundMoney(Number(body.discount) || 0);
  const payments: { method: PaymentMethod; amount: number; phone?: string }[] =
    body.payments || [];
  const creditDueAt = body.creditDueAt ? new Date(body.creditDueAt) : null;

  if (!lines.length) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  if (discount > 0 && !canChangePrice(user.role)) {
    return forbidden();
  }

  const hasCredit = payments.some((p) => p.method === "CREDIT");
  if (hasCredit && !canSellCredit(user.role)) return forbidden();

  const branchId = await resolveBranchId(user);
  const [session, settings, customer, promotions] = await Promise.all([
    prisma.posSession.findFirst({
      where: { status: "OPEN", branchId },
      orderBy: { createdAt: "desc" },
    }),
    getShopSettings(),
    customerId
      ? prisma.customer.findUnique({
          where: { id: customerId },
          include: { priceLevel: true },
        })
      : Promise.resolve(null),
    prisma.promotion.findMany({ where: { active: true } }),
  ]);

  if (!session) {
    return NextResponse.json(
      { error: "Open a drawer session before selling (Cash → Open session)" },
      { status: 400 }
    );
  }

  const now = new Date();
  const activePromos = promotions.filter((p) => {
    if (p.startsAt && p.startsAt > now) return false;
    if (p.endsAt && p.endsAt < now) return false;
    return true;
  });

  const productIds = lines.map((l) => l.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, active: true },
    include: { stocks: { where: { branchId } } },
  });
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const levelDiscount = customer?.priceLevel?.discountPercent || 0;

  let subtotal = 0;
  let costTotal = 0;
  const saleLines: {
    productId: string;
    name: string;
    unit: string;
    qty: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
    unitCost: number;
    serials?: string[];
  }[] = [];

  for (const line of lines) {
    const product = byId[line.productId];
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 400 });
    }
    const onHand = product.stocks[0]?.qty ?? 0;
    if (onHand < line.qty) {
      return NextResponse.json(
        { error: `Insufficient stock for ${product.name}` },
        { status: 400 }
      );
    }

    const serials = parseSerials(line.serials);
    if (product.trackSerial) {
      if (serials.length !== Math.round(line.qty)) {
        return NextResponse.json(
          { error: `${product.name} needs ${line.qty} serial number(s)` },
          { status: 400 }
        );
      }
    }

    let unitPrice =
      line.unitPrice != null && canChangePrice(user.role)
        ? Number(line.unitPrice)
        : product.sellPrice;

    if (!(line.unitPrice != null && canChangePrice(user.role)) && levelDiscount > 0) {
      unitPrice = roundMoney(unitPrice * (1 - levelDiscount / 100));
    }

    const promo = activePromos.find(
      (p) => !p.productId || p.productId === product.id
    );
    let lineDiscount = roundMoney(Number(line.discount) || 0);
    if (promo && promo.percentOff > 0) {
      lineDiscount = roundMoney(
        lineDiscount + unitPrice * line.qty * (promo.percentOff / 100)
      );
    }

    const lineTotal = roundMoney(Math.max(0, unitPrice * line.qty - lineDiscount));
    subtotal = roundMoney(subtotal + lineTotal);
    costTotal = roundMoney(costTotal + product.cost * line.qty);
    saleLines.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      qty: line.qty,
      unitPrice,
      discount: lineDiscount,
      lineTotal,
      unitCost: product.cost,
      ...(product.trackSerial ? { serials } : {}),
    });
  }

  const afterOrderDiscount = roundMoney(Math.max(0, subtotal - discount));
  const { taxAmount, total } = computeTax({
    amountAfterDiscount: afterOrderDiscount,
    vatPercent: settings.vatPercent,
    pricesIncludeVat: settings.pricesIncludeVat,
  });

  const cashTendered = roundMoney(
    payments.filter((p) => p.method === "CASH").reduce((s, p) => s + Number(p.amount), 0)
  );
  const nonCashSum = roundMoney(
    payments
      .filter((p) => p.method !== "CASH")
      .reduce((s, p) => s + Number(p.amount), 0)
  );
  const cashNeeded = roundMoney(Math.max(0, total - nonCashSum));
  if (nonCashSum - total > 0.01) {
    return NextResponse.json(
      { error: `Non-cash payments (${nonCashSum}) exceed total (${total})` },
      { status: 400 }
    );
  }
  if (cashNeeded > 0.01 && cashTendered + 0.01 < cashNeeded) {
    return NextResponse.json(
      { error: `Cash tendered (${cashTendered}) is short of ${cashNeeded}` },
      { status: 400 }
    );
  }
  if (cashNeeded <= 0.01 && cashTendered > 0.01) {
    return NextResponse.json(
      { error: "Cash not needed for this sale" },
      { status: 400 }
    );
  }

  const normalizedPayments = [
    ...payments.filter((p) => p.method !== "CASH" && Number(p.amount) > 0),
    ...(cashNeeded > 0.01
      ? [{ method: "CASH" as const, amount: cashNeeded, phone: undefined as string | undefined }]
      : []),
  ];
  const changeDue = roundMoney(Math.max(0, cashTendered - cashNeeded));

  if (hasCredit && customerId) {
    if (!customer) {
      return NextResponse.json({ error: "Customer required for credit" }, { status: 400 });
    }
    const creditAmt = payments
      .filter((p) => p.method === "CREDIT")
      .reduce((s, p) => s + Number(p.amount), 0);
    if (customer.creditLimit > 0 && customer.balance + creditAmt > customer.creditLimit) {
      return NextResponse.json({ error: "Credit limit exceeded" }, { status: 400 });
    }
  } else if (hasCredit && !customerId) {
    return NextResponse.json({ error: "Select a customer for credit sales" }, { status: 400 });
  }

  const mpesaPay = normalizedPayments.find((p) => p.method === "MPESA");
  const needsStk = Boolean(mpesaPay && mpesaPay.amount > 0);

  const creditAmtPlanned = roundMoney(
    normalizedPayments
      .filter((p) => p.method === "CREDIT")
      .reduce((s, p) => s + Number(p.amount), 0)
  );
  const creditBalanceBefore =
    creditAmtPlanned > 0 && customer ? roundMoney(customer.balance) : null;

  const result = await withTransaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        status: needsStk ? SaleStatus.PENDING : SaleStatus.COMPLETED,
        customerId: customerId || null,
        cashierId: user.id,
        branchId,
        sessionId: session.id,
        subtotal,
        discount,
        taxRate: settings.vatPercent,
        taxAmount,
        total,
        costTotal,
        creditDueAt:
          hasCredit && creditDueAt && !Number.isNaN(creditDueAt.getTime())
            ? creditDueAt
            : null,
        creditBalanceBefore,
        completedAt: needsStk ? null : new Date(),
        lines: { create: saleLines },
        payments: {
          create: normalizedPayments.map((p) => ({
            method: p.method,
            amount: Number(p.amount),
            status:
              p.method === "MPESA" ? PaymentStatus.PENDING : PaymentStatus.PAID,
            mpesaPhone: p.phone || null,
          })),
        },
      },
      include: { payments: true, lines: true, customer: true },
    });

    if (!needsStk) {
      for (const line of saleLines) {
        await getOrCreateStock(tx, branchId, line.productId);
        await adjustQty(tx, branchId, line.productId, -line.qty);
        await sellSerials(tx, line.productId, line.serials || [], sale.id, branchId);
      }
      if (creditAmtPlanned > 0 && customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { increment: creditAmtPlanned } },
        });
      }
      await postSaleJournal(tx, {
        id: sale.id,
        receiptNo: sale.receiptNo,
        total: sale.total,
        taxAmount: sale.taxAmount,
        costTotal: sale.costTotal,
        payments: sale.payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          status: p.status,
        })),
      });
    }

    return sale;
  });

  if (needsStk && mpesaPay) {
    const payment = result.payments.find((p) => p.method === "MPESA");
    if (!payment) {
      return NextResponse.json({ error: "M-Pesa payment missing" }, { status: 500 });
    }
    if (!mpesaPay.phone) {
      return NextResponse.json({ error: "M-Pesa phone required" }, { status: 400 });
    }
    try {
      const stk = await initiateStkPush({
        phone: mpesaPay.phone,
        amount: mpesaPay.amount,
        accountRef: `R${result.receiptNo}`,
        paymentId: payment.id,
      });

      if (stk.mock) {
        const completed = await completePendingSale(result.id);
        await writeAudit({
          userId: user.id,
          action: "SALE",
          entity: "Sale",
          entityId: result.id,
          detail: `Receipt #${result.receiptNo} (mock M-Pesa)`,
        });
        return NextResponse.json({ ...completed, changeDue, cashTendered });
      }

      return NextResponse.json({
        ...result,
        stkPending: true,
        checkoutRequestId: stk.checkoutRequestId,
        changeDue,
        cashTendered,
      });
    } catch (e) {
      await prisma.sale.update({
        where: { id: result.id },
        data: { status: SaleStatus.CANCELLED },
      });
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "M-Pesa failed" },
        { status: 400 }
      );
    }
  }

  await writeAudit({
    userId: user.id,
    action: "SALE",
    entity: "Sale",
    entityId: result.id,
    detail: `Receipt #${result.receiptNo}`,
  });

  return NextResponse.json(
    { ...result, changeDue, cashTendered },
    { status: 201 }
  );
}
