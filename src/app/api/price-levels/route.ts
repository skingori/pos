import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageInventory } from "@/lib/permissions";
import { zodErrorResponse } from "@/lib/api";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const levels = await prisma.priceLevel.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(levels);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageInventory(user.role)) return forbidden();
  try {
    const body = z
      .object({
        name: z.string().min(1),
        discountPercent: z.number().min(0).max(100).default(0),
      })
      .parse(await req.json());
    const level = await prisma.priceLevel.create({ data: body });
    return NextResponse.json(level, { status: 201 });
  } catch (e) {
    return zodErrorResponse(e);
  }
}
