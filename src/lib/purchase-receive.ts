import { suggestedSellPrice } from "@/lib/money";
import { parseSerials, receiveSerials } from "@/lib/serials";
import { adjustQty, getOrCreateStock } from "@/lib/branch-stock";
import type { Prisma } from "@prisma/client";

export type PurchaseLineInput = {
  productId: string;
  qty: number;
  unitCost: number;
  serials?: string[] | string;
};

export async function receiveLines(
  tx: Prisma.TransactionClient,
  branchId: string,
  lines: PurchaseLineInput[],
  recalcSell: boolean,
  markupPercent?: number
) {
  for (const line of lines) {
    const unitCost = Number(line.unitCost);
    const qty = Number(line.qty);
    const serials = parseSerials(line.serials);
    const product = await tx.product.findUnique({ where: { id: line.productId } });
    if (product?.trackSerial && serials.length !== Math.round(qty)) {
      throw new Error(`${product.name} needs ${qty} serial number(s)`);
    }
    await tx.product.update({
      where: { id: line.productId },
      data: {
        cost: unitCost,
        ...(recalcSell && markupPercent != null
          ? { sellPrice: suggestedSellPrice(unitCost, markupPercent) }
          : {}),
      },
    });
    await getOrCreateStock(tx, branchId, line.productId);
    await adjustQty(tx, branchId, line.productId, qty);
    await receiveSerials(tx, line.productId, serials, branchId);
  }
}
