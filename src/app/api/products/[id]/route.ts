import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageInventory, canChangePrice } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { roundMoney } from "@/lib/money";
import { getOrCreateReturnSku } from "@/lib/return-sku";
import { postJournal, CODES, ensureChartOfAccounts } from "@/lib/gl";
import { deleteProductImage } from "@/lib/product-image";
import { resolveBranchId } from "@/lib/branch";
import {
  adjustOpenedQty,
  adjustQty,
  getOrCreateStock,
  setStock,
  stockFields,
} from "@/lib/branch-stock";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageInventory(user.role)) return forbidden();

  const branchId = await resolveBranchId(user);
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "releaseOpened") {
    const qty = Number(body.qty);
    try {
      const product = await prisma.$transaction(async (tx) => {
        const parent = await tx.product.findUnique({ where: { id } });
        if (!parent) throw new Error("Not found");
        const returnSku = await getOrCreateReturnSku(tx, id);
        const returnStock = await getOrCreateStock(tx, branchId, returnSku.id);
        const parentStock = await getOrCreateStock(tx, branchId, id);
        if (!qty || qty <= 0 || qty > returnStock.qty) {
          throw new Error("Invalid return SKU qty");
        }
        await adjustQty(tx, branchId, returnSku.id, -qty);
        await adjustQty(tx, branchId, id, qty);
        await adjustOpenedQty(
          tx,
          branchId,
          id,
          -Math.min(qty, parentStock.openedQty)
        );
        return parent;
      });
      await writeAudit({
        userId: user.id,
        action: "RELEASE_OPENED",
        entity: "Product",
        entityId: id,
        detail: `Released ${qty} from return SKU to sellable`,
      });
      const stock = await getOrCreateStock(prisma, branchId, id);
      return NextResponse.json({ ...product, ...stockFields(stock), branchId });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Release failed" },
        { status: 400 }
      );
    }
  }

  if (body.action === "writeOffOpened") {
    const qty = Number(body.qty);
    try {
      const product = await prisma.$transaction(async (tx) => {
        const parent = await tx.product.findUnique({ where: { id } });
        if (!parent) throw new Error("Not found");
        const returnSku = await getOrCreateReturnSku(tx, id);
        const returnStock = await getOrCreateStock(tx, branchId, returnSku.id);
        const parentStock = await getOrCreateStock(tx, branchId, id);
        if (!qty || qty <= 0 || qty > returnStock.qty) {
          throw new Error("Invalid return SKU qty");
        }
        const loss = roundMoney(qty * (returnSku.cost || parent.cost));
        await adjustQty(tx, branchId, returnSku.id, -qty);
        await adjustOpenedQty(
          tx,
          branchId,
          id,
          -Math.min(qty, parentStock.openedQty)
        );
        await ensureChartOfAccounts(tx);
        await postJournal(tx, {
          memo: `Write off return SKU ${returnSku.sku}`,
          sourceType: "WriteOff",
          sourceId: `${id}-${Date.now()}`,
          lines: [
            { code: CODES.WRITE_OFF, debit: loss },
            { code: CODES.INVENTORY, credit: loss },
          ],
        });
        return parent;
      });
      await writeAudit({
        userId: user.id,
        action: "WRITE_OFF_OPENED",
        entity: "Product",
        entityId: id,
        detail: `Wrote off ${qty} from return SKU`,
      });
      const stock = await getOrCreateStock(prisma, branchId, id);
      return NextResponse.json({ ...product, ...stockFields(stock), branchId });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Write-off failed" },
        { status: 400 }
      );
    }
  }

  if (body.sellPrice != null && body.sellPrice !== existing.sellPrice && !canChangePrice(user.role)) {
    return forbidden();
  }

  if (body.cost != null && Number(body.cost) < 0) {
    return NextResponse.json({ error: "Buying price required" }, { status: 400 });
  }

  const nextImageUrl =
    body.imageUrl === undefined ? existing.imageUrl : body.imageUrl || null;

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        sku: body.sku ?? existing.sku,
        barcode: body.barcode === undefined ? existing.barcode : body.barcode || null,
        categoryId:
          body.categoryId === undefined ? existing.categoryId : body.categoryId || null,
        cost: body.cost != null ? Number(body.cost) : existing.cost,
        sellPrice: body.sellPrice != null ? Number(body.sellPrice) : existing.sellPrice,
        unit: body.unit ?? existing.unit,
        imageUrl: nextImageUrl,
        trackSerial:
          body.trackSerial != null ? Boolean(body.trackSerial) : existing.trackSerial,
        active: body.active ?? existing.active,
      },
    });
    if (body.qty != null || body.reorderLevel != null) {
      await setStock(tx, branchId, id, {
        qty: body.qty != null ? Number(body.qty) : undefined,
        reorderLevel: body.reorderLevel != null ? Number(body.reorderLevel) : undefined,
      });
    }
    return updated;
  });

  if (existing.imageUrl && existing.imageUrl !== product.imageUrl) {
    await deleteProductImage(existing.imageUrl);
  }

  const stock = await getOrCreateStock(prisma, branchId, id);

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "Product",
    entityId: product.id,
    detail: JSON.stringify({
      sellPrice: product.sellPrice,
      qty: stock.qty,
      openedQty: stock.openedQty,
      cost: product.cost,
      trackSerial: product.trackSerial,
      imageUrl: product.imageUrl,
      branchId,
    }),
  });

  return NextResponse.json({ ...product, ...stockFields(stock), branchId });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageInventory(user.role)) return forbidden();

  const { id } = await params;
  const product = await prisma.product.update({
    where: { id },
    data: { active: false },
  });

  await writeAudit({
    userId: user.id,
    action: "DELETE",
    entity: "Product",
    entityId: id,
    detail: product.name,
  });

  return NextResponse.json({ ok: true });
}
