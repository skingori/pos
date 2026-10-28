import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canApproveRefund } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { roundMoney } from "@/lib/money";
import { PaymentMethod, ReturnCondition } from "@prisma/client";
import { getOrCreateReturnSku } from "@/lib/return-sku";
import { parseSerials, returnSerials } from "@/lib/serials";
import { postRefundJournal } from "@/lib/gl";
import { adjustOpenedQty, adjustQty, getOrCreateStock } from "@/lib/branch-stock";
import { ensureMainBranch } from "@/lib/branch";

const CONDITIONS = new Set(["SELLABLE", "OPENED", "WRITE_OFF"]);
const PAYOUTS = new Set(["CASH", "MPESA", "CREDIT"]);

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const refunds = await prisma.refundRequest.findMany({
    include: {
      sale: { include: { customer: true, payments: true } },
      requester: true,
      reviewer: true,
      lines: { include: { product: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(refunds);
}

function parsePayout(raw: unknown): PaymentMethod {
  const v = String(raw || "CASH");
  return (PAYOUTS.has(v) ? v : "CASH") as PaymentMethod;
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const body = await req.json();

  const sale = await prisma.sale.findUnique({
    where: { id: body.saleId },
    include: {
      lines: true,
      customer: true,
      payments: true,
      refunds: {
        where: { status: { in: ["APPROVED", "PENDING"] } },
        include: { lines: true },
      },
    },
  });
  if (!sale || sale.status === "CANCELLED") {
    return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  }

  const payoutMethod = parsePayout(body.payoutMethod);
  if (payoutMethod === "CREDIT" && !sale.customerId) {
    return NextResponse.json(
      { error: "Credit refund needs a customer on the sale" },
      { status: 400 }
    );
  }

  const alreadyRefunded: Record<string, number> = {};
  for (const r of sale.refunds) {
    for (const l of r.lines) {
      alreadyRefunded[l.productId] = (alreadyRefunded[l.productId] || 0) + l.qty;
    }
  }

  const lines: { productId: string; qty: number; condition?: string; serials?: unknown }[] =
    body.lines || [];
  if (!lines.length) {
    return NextResponse.json({ error: "Select items to refund" }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: lines.map((l) => l.productId) } },
  });
  const productById = Object.fromEntries(products.map((p) => [p.id, p]));

  try {
    const refundLines = lines.map((l) => {
      const saleLine = sale.lines.find((sl) => sl.productId === l.productId);
      if (!saleLine) throw new Error("Invalid line");
      const remaining = saleLine.qty - (alreadyRefunded[l.productId] || 0);
      if (remaining <= 0) {
        throw new Error(`${saleLine.name} already fully refunded`);
      }
      const qty = Math.min(Number(l.qty), remaining);
      if (qty <= 0) throw new Error(`Invalid qty for ${saleLine.name}`);
      const condition = (CONDITIONS.has(l.condition || "")
        ? l.condition
        : "SELLABLE") as ReturnCondition;
      const amount = roundMoney((saleLine.lineTotal / saleLine.qty) * qty);
      const product = productById[l.productId];
      const unitCost = saleLine.unitCost || product?.cost || 0;
      const serials = parseSerials(l.serials);
      if (product?.trackSerial && serials.length !== Math.round(qty)) {
        throw new Error(`${saleLine.name} needs ${qty} serial number(s)`);
      }
      return {
        productId: l.productId,
        qty,
        amount,
        condition,
        unitCost,
        ...(product?.trackSerial ? { serials } : {}),
      };
    });

    const amount = roundMoney(refundLines.reduce((s, l) => s + l.amount, 0));
    const autoApprove = canApproveRefund(user.role);

    const refund = await prisma.refundRequest.create({
      data: {
        saleId: sale.id,
        requesterId: user.id,
        status: autoApprove ? "APPROVED" : "PENDING",
        reason: body.reason || null,
        amount,
        payoutMethod,
        mpesaRef: body.mpesaRef || null,
        reviewerId: autoApprove ? user.id : null,
        reviewedAt: autoApprove ? new Date() : null,
        lines: {
          create: refundLines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            amount: l.amount,
            condition: l.condition,
            unitCost: l.unitCost,
            ...(l.serials ? { serials: l.serials } : {}),
          })),
        },
      },
      include: { lines: true },
    });

    if (autoApprove) {
      await applyRefund(refund.id, user.id, {
        payoutMethod,
        mpesaRef: body.mpesaRef || null,
      });
    }

    await writeAudit({
      userId: user.id,
      action: autoApprove ? "REFUND_APPROVED" : "REFUND_REQUEST",
      entity: "RefundRequest",
      entityId: refund.id,
      detail: `${amount} via ${payoutMethod}`,
    });

    return NextResponse.json(refund, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Refund failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canApproveRefund(user.role)) return forbidden();

  const body = await req.json();
  const refund = await prisma.refundRequest.findUnique({
    where: { id: body.id },
    include: { sale: true },
  });
  if (!refund || refund.status !== "PENDING") {
    return NextResponse.json({ error: "Invalid refund" }, { status: 400 });
  }

  if (body.decision === "REJECT") {
    const updated = await prisma.refundRequest.update({
      where: { id: refund.id },
      data: {
        status: "REJECTED",
        reviewerId: user.id,
        reviewedAt: new Date(),
      },
    });
    await writeAudit({
      userId: user.id,
      action: "REFUND_REJECTED",
      entity: "RefundRequest",
      entityId: refund.id,
    });
    return NextResponse.json(updated);
  }

  const payoutMethod = body.payoutMethod
    ? parsePayout(body.payoutMethod)
    : refund.payoutMethod;

  if (payoutMethod === "CREDIT" && !refund.sale.customerId) {
    return NextResponse.json(
      { error: "Credit refund needs a customer on the sale" },
      { status: 400 }
    );
  }

  await applyRefund(refund.id, user.id, {
    payoutMethod,
    mpesaRef: body.mpesaRef ?? refund.mpesaRef,
  });
  const updated = await prisma.refundRequest.findUnique({
    where: { id: refund.id },
    include: { lines: true, sale: true },
  });
  return NextResponse.json(updated);
}

async function applyRefund(
  refundId: string,
  reviewerId: string,
  opts: { payoutMethod: PaymentMethod; mpesaRef?: string | null }
) {
  await prisma.$transaction(async (tx) => {
    const refund = await tx.refundRequest.findUnique({
      where: { id: refundId },
      include: { lines: true, sale: { include: { payments: true, customer: true } } },
    });
    if (!refund) return;

    const branchId =
      refund.sale.branchId || (await ensureMainBranch()).id;

    const openSession = await tx.posSession.findFirst({
      where: { status: "OPEN", branchId },
      orderBy: { createdAt: "desc" },
    });

    let costReturned = 0;
    let writeOffCost = 0;

    for (const line of refund.lines) {
      const serials = parseSerials(line.serials);
      const unitCost = line.unitCost || 0;
      const lineCost = roundMoney(unitCost * line.qty);

      if (line.condition === "SELLABLE") {
        await getOrCreateStock(tx, branchId, line.productId);
        await adjustQty(tx, branchId, line.productId, line.qty);
        await returnSerials(tx, line.productId, serials, "SELLABLE", undefined, branchId);
        costReturned = roundMoney(costReturned + lineCost);
      } else if (line.condition === "OPENED") {
        const returnSku = await getOrCreateReturnSku(tx, line.productId);
        await getOrCreateStock(tx, branchId, returnSku.id);
        await adjustQty(tx, branchId, returnSku.id, line.qty);
        await adjustOpenedQty(tx, branchId, line.productId, line.qty);
        await returnSerials(
          tx,
          line.productId,
          serials,
          "OPENED",
          returnSku.id,
          branchId
        );
        costReturned = roundMoney(costReturned + lineCost);
      } else {
        await returnSerials(tx, line.productId, serials, "WRITE_OFF", undefined, branchId);
        writeOffCost = roundMoney(writeOffCost + lineCost);
      }
    }

    const payout = opts.payoutMethod;

    if (payout === "CREDIT") {
      if (!refund.sale.customerId) {
        throw new Error("Customer required for credit refund");
      }
      await tx.customer.update({
        where: { id: refund.sale.customerId },
        data: { balance: { decrement: refund.amount } },
      });
    }

    if (payout === "CASH" && openSession) {
      await tx.cashMovement.create({
        data: {
          sessionId: openSession.id,
          userId: reviewerId,
          type: "OUT",
          amount: refund.amount,
          note: `Refund payout #${refund.sale.receiptNo}`,
        },
      });
    }

    await tx.refundRequest.update({
      where: { id: refundId },
      data: {
        status: "APPROVED",
        reviewerId,
        reviewedAt: new Date(),
        payoutMethod: payout,
        mpesaRef: payout === "MPESA" ? opts.mpesaRef || null : null,
        sessionId: openSession?.id || null,
      },
    });

    const totalRefunded = await tx.refundRequest.aggregate({
      where: { saleId: refund.saleId, status: "APPROVED" },
      _sum: { amount: true },
    });
    const sum = totalRefunded._sum.amount || 0;
    await tx.sale.update({
      where: { id: refund.saleId },
      data: {
        status: sum >= refund.sale.total - 0.01 ? "REFUNDED" : "PARTIALLY_REFUNDED",
      },
    });

    await postRefundJournal(tx, {
      id: refund.id,
      amount: refund.amount,
      payoutMethod: payout,
      costReturned,
      writeOffCost,
      receiptNo: refund.sale.receiptNo,
    });
  });

  await writeAudit({
    userId: reviewerId,
    action: "REFUND_APPROVED",
    entity: "RefundRequest",
    entityId: refundId,
    detail: `Payout ${opts.payoutMethod}`,
  });
}
