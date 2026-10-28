import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function getOrCreateStock(tx: Tx, branchId: string, productId: string) {
  const existing = await tx.branchStock.findUnique({
    where: { branchId_productId: { branchId, productId } },
  });
  if (existing) return existing;
  return tx.branchStock.create({
    data: { branchId, productId, qty: 0, openedQty: 0, reorderLevel: 0 },
  });
}

export async function setStock(
  tx: Tx,
  branchId: string,
  productId: string,
  data: { qty?: number; openedQty?: number; reorderLevel?: number }
) {
  await getOrCreateStock(tx, branchId, productId);
  return tx.branchStock.update({
    where: { branchId_productId: { branchId, productId } },
    data: {
      ...(data.qty != null ? { qty: data.qty } : {}),
      ...(data.openedQty != null ? { openedQty: data.openedQty } : {}),
      ...(data.reorderLevel != null ? { reorderLevel: data.reorderLevel } : {}),
    },
  });
}

export async function adjustQty(
  tx: Tx,
  branchId: string,
  productId: string,
  delta: number
) {
  await getOrCreateStock(tx, branchId, productId);
  return tx.branchStock.update({
    where: { branchId_productId: { branchId, productId } },
    data: { qty: { increment: delta } },
  });
}

export async function adjustOpenedQty(
  tx: Tx,
  branchId: string,
  productId: string,
  delta: number
) {
  await getOrCreateStock(tx, branchId, productId);
  return tx.branchStock.update({
    where: { branchId_productId: { branchId, productId } },
    data: { openedQty: { increment: delta } },
  });
}

export function stockFields(stock?: {
  qty: number;
  openedQty: number;
  reorderLevel: number;
} | null) {
  return {
    qty: stock?.qty ?? 0,
    openedQty: stock?.openedQty ?? 0,
    reorderLevel: stock?.reorderLevel ?? 0,
  };
}
