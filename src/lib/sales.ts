import { prisma, withTransaction } from "./prisma";
import { PaymentStatus, SaleStatus } from "@prisma/client";
import { postSaleJournal } from "./gl";
import { sellSerials, parseSerials } from "./serials";
import { adjustQty, getOrCreateStock } from "./branch-stock";
import { roundMoney } from "./money";

export async function completePendingSale(saleId: string) {
  return withTransaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { lines: true, payments: true, customer: true },
    });
    if (!sale || sale.status !== SaleStatus.PENDING) return sale;

    const mpesa = sale.payments.find((p) => p.method === "MPESA");
    if (mpesa && mpesa.status !== PaymentStatus.PAID) {
      throw new Error("M-Pesa not paid yet");
    }

    const branchId = sale.branchId;
    if (!branchId) throw new Error("Sale has no branch");

    for (const line of sale.lines) {
      const stock = await getOrCreateStock(tx, branchId, line.productId);
      if (stock.qty < line.qty) {
        throw new Error(`Insufficient stock for ${line.name}`);
      }
      await adjustQty(tx, branchId, line.productId, -line.qty);
      await sellSerials(
        tx,
        line.productId,
        parseSerials(line.serials),
        sale.id,
        branchId
      );
    }

    // CREDIT rows are still PENDING until this step marks non-M-Pesa paid;
    // include them so split credit + M-Pesa still updates the account.
    const creditAmt = roundMoney(
      sale.payments
        .filter((p) => p.method === "CREDIT")
        .reduce((s, p) => s + p.amount, 0)
    );
    let creditBalanceBefore = sale.creditBalanceBefore;
    if (creditAmt > 0 && sale.customerId) {
      if (creditBalanceBefore == null) {
        creditBalanceBefore = roundMoney(sale.customer?.balance ?? 0);
      }
      await tx.customer.update({
        where: { id: sale.customerId },
        data: { balance: { increment: creditAmt } },
      });
    }

    await tx.payment.updateMany({
      where: {
        saleId,
        method: { not: "MPESA" },
        status: PaymentStatus.PENDING,
      },
      data: { status: PaymentStatus.PAID },
    });

    const completed = await tx.sale.update({
      where: { id: saleId },
      data: {
        status: SaleStatus.COMPLETED,
        completedAt: new Date(),
        ...(creditBalanceBefore != null ? { creditBalanceBefore } : {}),
      },
      include: { lines: true, payments: true, customer: true, cashier: true },
    });

    await postSaleJournal(tx, {
      id: completed.id,
      receiptNo: completed.receiptNo,
      total: completed.total,
      taxAmount: completed.taxAmount,
      costTotal: completed.costTotal,
      payments: completed.payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        status: p.method === "MPESA" || p.status === PaymentStatus.PAID ? "PAID" : p.status,
      })),
    });

    return completed;
  });
}
