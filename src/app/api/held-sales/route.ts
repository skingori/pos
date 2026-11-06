import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized } from "@/lib/api-auth";
import { resolveBranchId } from "@/lib/branch";
import {
  HELD_MAX_PER_BRANCH,
  heldExpiresAt,
  pruneExpiredHeldSales,
  serializeHeldSale,
} from "@/lib/held-sales";

const includeCashier = { cashier: { select: { name: true } } } as const;

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();

  const branchId = await resolveBranchId(user);
  await pruneExpiredHeldSales(branchId);

  const rows = await prisma.heldSale.findMany({
    where: { branchId, expiresAt: { gt: new Date() } },
    include: includeCashier,
    orderBy: { createdAt: "desc" },
    take: HELD_MAX_PER_BRANCH,
  });

  return NextResponse.json(rows.map(serializeHeldSale));
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();

  const branchId = await resolveBranchId(user);
  await pruneExpiredHeldSales(branchId);

  const body = await req.json().catch(() => null);
  const cart = Array.isArray(body?.cart) ? body.cart : null;
  if (!cart?.length) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const activeCount = await prisma.heldSale.count({
    where: { branchId, expiresAt: { gt: new Date() } },
  });
  if (activeCount >= HELD_MAX_PER_BRANCH) {
    return NextResponse.json(
      {
        error: `At most ${HELD_MAX_PER_BRANCH} held sales per branch. Discard or restore one first.`,
      },
      { status: 400 }
    );
  }

  const discount = Number(body?.discount) || 0;
  const discountMode =
    body?.discountMode === "5" ||
    body?.discountMode === "10" ||
    body?.discountMode === "custom"
      ? body.discountMode
      : "none";
  const promoCode = typeof body?.promoCode === "string" ? body.promoCode : "";
  const customerId =
    typeof body?.customerId === "string" && body.customerId.trim()
      ? body.customerId.trim()
      : null;
  const label =
    (typeof body?.label === "string" && body.label.trim()) ||
    `Sale (${cart.length} items)`;

  if (customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 400 });
    }
  }

  const row = await prisma.heldSale.create({
    data: {
      branchId,
      cashierId: user.id,
      customerId,
      label,
      cart,
      discount,
      discountMode,
      promoCode,
      expiresAt: heldExpiresAt(),
    },
    include: includeCashier,
  });

  return NextResponse.json(serializeHeldSale(row), { status: 201 });
}
