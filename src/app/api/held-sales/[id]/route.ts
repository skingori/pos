import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized } from "@/lib/api-auth";
import { resolveBranchId } from "@/lib/branch";
import { serializeHeldSale } from "@/lib/held-sales";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();

  const { id } = await ctx.params;
  const branchId = await resolveBranchId(user);

  const existing = await prisma.heldSale.findFirst({
    where: { id, branchId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Held sale not found" }, { status: 404 });
  }

  await prisma.heldSale.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

/** Claim a held sale for restore: returns payload and removes it from the DB. */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();

  const { id } = await ctx.params;
  const branchId = await resolveBranchId(user);

  const existing = await prisma.heldSale.findFirst({
    where: { id, branchId },
    include: { cashier: { select: { name: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Held sale not found" }, { status: 404 });
  }
  if (existing.expiresAt.getTime() < Date.now()) {
    await prisma.heldSale.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ error: "Held sale expired" }, { status: 410 });
  }

  await prisma.heldSale.delete({ where: { id } });
  return NextResponse.json(serializeHeldSale(existing));
}
