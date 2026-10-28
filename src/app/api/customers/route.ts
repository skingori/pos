import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageInventory } from "@/lib/permissions";
import { zodErrorResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const customers = await prisma.customer.findMany({
    where: {
      active: true,
      ...(q
        ? {
            OR: [{ name: { contains: q } }, { phone: { contains: q } }],
          }
        : {}),
    },
    include: { priceLevel: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(customers);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const body = z
      .object({
        name: z.string().min(1),
        phone: z.string().nullable().optional(),
        email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
        creditLimit: z.number().min(0).optional(),
        priceLevelId: z.string().nullable().optional(),
      })
      .parse(await req.json());
    const customer = await prisma.customer.create({
      data: {
        name: body.name,
        phone: body.phone || null,
        email: body.email || null,
        creditLimit: body.creditLimit || 0,
        priceLevelId: body.priceLevelId || null,
      },
      include: { priceLevel: true },
    });
    return NextResponse.json(customer, { status: 201 });
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
      .object({
        id: z.string(),
        name: z.string().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        creditLimit: z.number().optional(),
        priceLevelId: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(await req.json());
    const customer = await prisma.customer.update({
      where: { id: body.id },
      data: {
        name: body.name,
        phone: body.phone,
        email: body.email,
        creditLimit: body.creditLimit,
        priceLevelId: body.priceLevelId,
        active: body.active,
      },
      include: { priceLevel: true },
    });
    return NextResponse.json(customer);
  } catch (e) {
    return zodErrorResponse(e);
  }
}
