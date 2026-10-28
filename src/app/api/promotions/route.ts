import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageInventory } from "@/lib/permissions";
import { zodErrorResponse } from "@/lib/api";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const now = new Date();
  const promotions = await prisma.promotion.findMany({
    where: {
      active: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(promotions);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageInventory(user.role)) return forbidden();
  try {
    const body = z
      .object({
        name: z.string().min(1),
        percentOff: z.number().min(0).max(100),
        productId: z.string().nullable().optional(),
        startsAt: z.string().datetime().nullable().optional(),
        endsAt: z.string().datetime().nullable().optional(),
      })
      .parse(await req.json());
    const promotion = await prisma.promotion.create({
      data: {
        name: body.name,
        percentOff: body.percentOff,
        productId: body.productId || null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
      },
    });
    return NextResponse.json(promotion, { status: 201 });
  } catch (e) {
    return zodErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageInventory(user.role)) return forbidden();
  try {
    const body = z
      .object({ id: z.string(), active: z.boolean().optional(), percentOff: z.number().optional() })
      .parse(await req.json());
    const promotion = await prisma.promotion.update({
      where: { id: body.id },
      data: {
        active: body.active,
        percentOff: body.percentOff,
      },
    });
    return NextResponse.json(promotion);
  } catch (e) {
    return zodErrorResponse(e);
  }
}
