import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { roundMoney } from "@/lib/money";
import { getCustomerOpenCharges } from "@/lib/customer-account";
import { adjustQty, getOrCreateStock } from "@/lib/branch-stock";
import { ensureMainBranch } from "@/lib/branch";
import { PaymentStatus, SaleStatus } from "@prisma/client";
import { returnSerials, parseSerials } from "@/lib/serials";
import { postVoidCreditJournal } from "@/lib/gl";

/** Void an unsettled credit sale: restock items, clear open balance, cancel sale. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "refunds.approve")) return forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      lines: true,
      payments: true,
      customer: true,
    },
  });
  if (!sale) {
    return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  }
  if (sale.status === SaleStatus.CANCELLED || sale.status === SaleStatus.REFUNDED) {
    return NextResponse.json({ error: "Sale is already closed" }, { status: 400 });
  }
  if (!sale.customerId) {
    return NextResponse.json(
      { error: "Only credit account sales can be voided" },
      { status: 400 }
    );
  }

  const collected = roundMoney(
    sale.payments
      .filter((p) => p.method !== "CREDIT" && p.status === PaymentStatus.PAID)
      .reduce((s, p) => s + p.amount, 0)
  );
  if (collected > 0.009) {
    return NextResponse.json(
      {
        error:
          "This sale has collected payments. Use a refund instead of voiding credit.",
      },
      { status: 400 }
    );
  }

  const openCharges = await getCustomerOpenCharges(sale.customerId);
  const charge = openCharges.find((c) => c.saleId === sale.id);
  const openAmount = charge?.openAmount || 0;
  if (openAmount <= 0.009) {
    return NextResponse.json(
      { error: "No unsettled credit on this sale" },
      { status: 400 }
    );
  }

  const branchId = sale.branchId || (await ensureMainBranch()).id;

  await prisma.$transaction(async (tx) => {
    for (const line of sale.lines) {
      await getOrCreateStock(tx, branchId, line.productId);
      await adjustQty(tx, branchId, line.productId, line.qty);
      const serials = parseSerials(line.serials);
      if (serials.length) {
        await returnSerials(tx, line.productId, serials, "SELLABLE", undefined, branchId);
      }
    }

    await tx.customer.update({
      where: { id: sale.customerId! },
      data: { balance: { decrement: openAmount } },
    });

    await tx.payment.updateMany({
      where: { saleId: sale.id, method: "CREDIT" },
      data: { status: PaymentStatus.REFUNDED },
    });

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: SaleStatus.CANCELLED,
        note: reason
          ? [sale.note, `Voided: ${reason}`].filter(Boolean).join(" · ")
          : sale.note || "Voided credit sale",
      },
    });

    await postVoidCreditJournal(tx, {
      id: sale.id,
      receiptNo: sale.receiptNo,
      openAmount,
      total: sale.total,
      taxAmount: sale.taxAmount,
      costTotal: sale.costTotal,
    });
  });

  await writeAudit({
    userId: user.id,
    action: "VOID_CREDIT",
    entity: "Sale",
    entityId: sale.id,
    detail: `Receipt #${sale.receiptNo} · ${openAmount}${reason ? ` · ${reason}` : ""}`,
  });

  return NextResponse.json({ ok: true, openAmount, receiptNo: sale.receiptNo });
}
