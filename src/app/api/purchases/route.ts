import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { roundMoney } from "@/lib/money";
import { getShopSettings } from "@/lib/settings";
import { postPurchaseJournal } from "@/lib/gl";
import { resolveBranchId } from "@/lib/branch";
import {
  receiveLines,
  type PurchaseLineInput,
} from "@/lib/purchase-receive";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "purchasing.view")) return forbidden();
  const purchases = await prisma.purchase.findMany({
    include: { supplier: true, user: true, lines: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json(purchases);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "purchasing.manage")) return forbidden();

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
  if (!hasPermission(user, "purchasing.manage")) return forbidden();

  const body = await req.json();
  const purchase = await prisma.purchase.findUnique({
    where: { id: body.id },
    include: { lines: true },
  });
  if (!purchase) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "update") {
    if (purchase.status !== "ORDERED") {
      return NextResponse.json(
        { error: "Only open purchase orders can be edited" },
        { status: 400 }
      );
    }
    const lines: PurchaseLineInput[] = body.lines || [];
    if (!lines.length) {
      return NextResponse.json({ error: "Add at least one line" }, { status: 400 });
    }
    const totalCost = roundMoney(
      lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitCost), 0)
    );
    const updated = await prisma.$transaction(async (tx) => {
      await tx.purchaseLine.deleteMany({ where: { purchaseId: purchase.id } });
      return tx.purchase.update({
        where: { id: purchase.id },
        data: {
          supplierId: body.supplierId || null,
          note: body.note || null,
          totalCost,
          lines: {
            create: lines.map((l) => ({
              productId: l.productId,
              qty: Number(l.qty),
              unitCost: Number(l.unitCost),
            })),
          },
        },
        include: { lines: { include: { product: true } }, supplier: true, user: true },
      });
    });
    await writeAudit({
      userId: user.id,
      action: "PURCHASE_UPDATE",
      entity: "Purchase",
      entityId: updated.id,
    });
    return NextResponse.json(updated);
  }

  if (body.action === "delete") {
    if (purchase.status === "RECEIVED") {
      return NextResponse.json(
        { error: "Received purchases cannot be deleted" },
        { status: 400 }
      );
    }
    await prisma.purchase.delete({ where: { id: purchase.id } });
    await writeAudit({
      userId: user.id,
      action: "PURCHASE_DELETE",
      entity: "Purchase",
      entityId: purchase.id,
    });
    return NextResponse.json({ ok: true });
  }

  if (purchase.status === "RECEIVED") {
    return NextResponse.json({ error: "Already received" }, { status: 400 });
  }
  if (purchase.status === "CANCELLED") {
    return NextResponse.json({ error: "Purchase is cancelled" }, { status: 400 });
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

export async function DELETE(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "purchasing.manage")) return forbidden();

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const purchase = await prisma.purchase.findUnique({ where: { id } });
  if (!purchase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (purchase.status === "RECEIVED") {
    return NextResponse.json(
      { error: "Received purchases cannot be deleted" },
      { status: 400 }
    );
  }

  await prisma.purchase.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    action: "PURCHASE_DELETE",
    entity: "Purchase",
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}
