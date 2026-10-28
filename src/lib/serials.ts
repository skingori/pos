import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

function uniq(serials: string[]) {
  const cleaned = serials.map((s) => s.trim()).filter(Boolean);
  if (new Set(cleaned).size !== cleaned.length) {
    throw new Error("Duplicate serial numbers");
  }
  return cleaned;
}

export async function receiveSerials(
  tx: Tx,
  productId: string,
  serials: string[],
  branchId?: string | null
) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product?.trackSerial) return;
  const list = uniq(serials);
  if (list.length === 0) throw new Error(`Serials required for ${product.name}`);
  for (const serial of list) {
    await tx.serialUnit.create({
      data: {
        productId,
        serial,
        status: "IN_STOCK",
        branchId: branchId || null,
      },
    });
  }
}

export async function sellSerials(
  tx: Tx,
  productId: string,
  serials: string[],
  saleId: string,
  branchId?: string | null
) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product?.trackSerial) return;
  const list = uniq(serials);
  if (list.length === 0) throw new Error(`Serials required for ${product.name}`);
  for (const serial of list) {
    const unit = await tx.serialUnit.findUnique({
      where: { productId_serial: { productId, serial } },
    });
    if (!unit || unit.status !== "IN_STOCK") {
      throw new Error(`Serial ${serial} not in stock for ${product.name}`);
    }
    if (branchId && unit.branchId && unit.branchId !== branchId) {
      throw new Error(`Serial ${serial} is not at this branch`);
    }
    await tx.serialUnit.update({
      where: { id: unit.id },
      data: { status: "SOLD", saleId, branchId: null },
    });
  }
}

export async function returnSerials(
  tx: Tx,
  productId: string,
  serials: string[],
  condition: "SELLABLE" | "OPENED" | "WRITE_OFF",
  returnSkuId?: string,
  branchId?: string | null
) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product?.trackSerial) return;
  const list = uniq(serials);
  for (const serial of list) {
    const unit = await tx.serialUnit.findUnique({
      where: { productId_serial: { productId, serial } },
    });
    if (!unit) throw new Error(`Unknown serial ${serial}`);
    if (condition === "SELLABLE") {
      await tx.serialUnit.update({
        where: { id: unit.id },
        data: { status: "IN_STOCK", saleId: null, branchId: branchId || null },
      });
    } else if (condition === "OPENED" && returnSkuId) {
      await tx.serialUnit.delete({ where: { id: unit.id } });
      await tx.serialUnit.create({
        data: {
          productId: returnSkuId,
          serial,
          status: "IN_STOCK",
          branchId: branchId || null,
        },
      });
    } else {
      await tx.serialUnit.update({
        where: { id: unit.id },
        data: { status: "WRITTEN_OFF", saleId: null, branchId: null },
      });
    }
  }
}

export function parseSerials(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    return raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}
