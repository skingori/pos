import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageInventory } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { roundMoney, suggestedSellPrice } from "@/lib/money";
import { getShopSettings } from "@/lib/settings";
import { postPurchaseJournal } from "@/lib/gl";
import { parseSerials, receiveSerials } from "@/lib/serials";
import type { Prisma } from "@prisma/client";
import { resolveBranchId } from "@/lib/branch";
import { adjustQty, getOrCreateStock } from "@/lib/branch-stock";

type PurchaseLineInput = {
  productId: string;
  qty: number;
  unitCost: number;
  serials?: string[] | string;
};

async function receiveLines(
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

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const purchases = await prisma.purchase.findMany({
    include: { supplier: true, user: true, lines: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(purchases);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageInventory(user.role)) return forbidden();

  const body = await req.json();
  const lines: PurchaseLineInput[] = body.lines || [];
  if (!lines.length) {
    return NextResponse.json({ error: "Add at least one line" }, { status: 400 });
  }

  const totalCost = roundMoney(
    lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitCost), 0)
  );

  const recalcSell = Boolean(body.recalculateSellFromMarkup);
  const settings = recalcSell ? await getShopSettings() : null;

  const status = body.status === "ORDERED" ? "ORDERED" : "RECEIVED";
  const receiveNow = status === "RECEIVED";
  const branchId = await resolveBranchId(user);

  try {
    const purchase = await prisma.$transaction(async (tx) => {
      const p = await tx.purchase.create({
        data: {
          supplierId: body.supplierId || null,
          userId: user.id,
          branchId,
          status,
          note: body.note || null,
          totalCost,
          orderedAt: status === "ORDERED" ? new Date() : null,
          receivedAt: receiveNow ? new Date() : null,
          lines: {
            create: lines.map((l) => ({
              productId: l.productId,
              qty: Number(l.qty),
              unitCost: Number(l.unitCost),
            })),
          },
        },
        include: { lines: true, supplier: true },
      });

      if (receiveNow) {
        await receiveLines(
          tx,
          branchId,
          lines,
          recalcSell,
          settings?.defaultMarkupPercent
        );
        await postPurchaseJournal(tx, { id: p.id, totalCost: p.totalCost });
      }

      return p;
    });

    await writeAudit({
      userId: user.id,
      action: "PURCHASE",
      entity: "Purchase",
      entityId: purchase.id,
      detail: `Total ${totalCost}`,
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Purchase failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageInventory(user.role)) return forbidden();

  const body = await req.json();
  const purchase = await prisma.purchase.findUnique({
    where: { id: body.id },
    include: { lines: true },
  });
  if (!purchase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (purchase.status === "RECEIVED") {
    return NextResponse.json({ error: "Already received" }, { status: 400 });
  }
  if (body.action === "cancel") {
    const updated = await prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: "CANCELLED" },
    });
    return NextResponse.json(updated);
  }

  const recalcSell = Boolean(body.recalculateSellFromMarkup);
  const settings = recalcSell ? await getShopSettings() : null;
  const serialMap: Record<string, string[] | string> = body.serialsByProductId || {};

  const branchId = purchase.branchId || (await resolveBranchId(user));

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await receiveLines(
        tx,
        branchId,
        purchase.lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitCost: l.unitCost,
          serials: serialMap[l.productId],
        })),
        recalcSell,
        settings?.defaultMarkupPercent
      );
      const p = await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: "RECEIVED", receivedAt: new Date() },
        include: { lines: { include: { product: true } }, supplier: true },
      });
      await postPurchaseJournal(tx, { id: p.id, totalCost: p.totalCost });
      return p;
    });

    await writeAudit({
      userId: user.id,
      action: "PURCHASE_RECEIVE",
      entity: "Purchase",
      entityId: updated.id,
    });

    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Receive failed" },
      { status: 400 }
    );
  }
}
