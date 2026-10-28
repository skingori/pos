import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Ensure each sellable product has a linked "opened return" SKU. */
export async function getOrCreateReturnSku(tx: Tx, productId: string) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Product not found");
  if (product.isReturnSku) return product;

  const existing = await tx.product.findFirst({
    where: { parentProductId: productId, isReturnSku: true },
  });
  if (existing) return existing;

  const sku = `${product.sku}-RTN`;
  return tx.product.create({
    data: {
      name: `${product.name} (Opened return)`,
      sku,
      barcode: product.barcode ? `${product.barcode}-RTN` : null,
      categoryId: product.categoryId,
      cost: product.cost,
      sellPrice: Math.round(product.sellPrice * 0.7 * 100) / 100,
      unit: product.unit,
      isReturnSku: true,
      parentProductId: product.id,
      trackSerial: product.trackSerial,
      active: true,
    },
  });
}
