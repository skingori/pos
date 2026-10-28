import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { canManageInventory } from "@/lib/permissions";
import { resolveBranchId } from "@/lib/branch";
import { getOrCreateStock, stockFields } from "@/lib/branch-stock";

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();

  const branchId = await resolveBranchId(user);
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim();
  const categoryId = searchParams.get("categoryId");
  const belowReorder = searchParams.get("belowReorder") === "1";

  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...(categoryId ? { categoryId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { sku: { contains: q } },
              { barcode: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      category: true,
      stocks: { where: { branchId } },
      returnSkus: {
        where: { active: true },
        include: { stocks: { where: { branchId } } },
      },
      parentProduct: { select: { id: true, sku: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const mapped = products.map((p) => {
    const stock = stockFields(p.stocks[0]);
    const returnSkus = p.returnSkus.map((r) => ({
      id: r.id,
      sku: r.sku,
      sellPrice: r.sellPrice,
      qty: stockFields(r.stocks[0]).qty,
    }));
    const { stocks: _s, returnSkus: _r, ...rest } = p;
    return { ...rest, ...stock, returnSkus, branchId };
  });

  const filtered = belowReorder
    ? mapped.filter((p) => p.qty <= p.reorderLevel)
    : mapped;

  return NextResponse.json(filtered);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageInventory(user.role)) return forbidden();

  const branchId = await resolveBranchId(user);
  const body = await req.json();
  const cost = Number(body.cost);
  if (!Number.isFinite(cost) || cost < 0) {
    return NextResponse.json({ error: "Buying price is required" }, { status: 400 });
  }
  if (!Number.isFinite(Number(body.sellPrice)) || Number(body.sellPrice) <= 0) {
    return NextResponse.json({ error: "Sell price is required" }, { status: 400 });
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name: body.name,
        sku: body.sku,
        barcode: body.barcode || null,
        categoryId: body.categoryId || null,
        cost,
        sellPrice: Number(body.sellPrice),
        unit: body.unit || "pc",
        imageUrl: body.imageUrl || null,
        trackSerial: Boolean(body.trackSerial),
      },
    });
    await getOrCreateStock(tx, branchId, created.id);
    await tx.branchStock.update({
      where: { branchId_productId: { branchId, productId: created.id } },
      data: {
        qty: Number(body.qty) || 0,
        reorderLevel: Number(body.reorderLevel) || 0,
      },
    });
    return created;
  });

  const stock = await prisma.branchStock.findUnique({
    where: { branchId_productId: { branchId, productId: product.id } },
  });

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entity: "Product",
    entityId: product.id,
    detail: product.name,
  });

  return NextResponse.json(
    { ...product, ...stockFields(stock), branchId },
    { status: 201 }
  );
}
