import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageInventory } from "@/lib/permissions";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const suppliers = await prisma.supplier.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(suppliers);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageInventory(user.role)) return forbidden();
  const body = await req.json();
  const supplier = await prisma.supplier.create({
    data: {
      name: body.name,
      phone: body.phone || null,
      email: body.email || null,
    },
  });
  return NextResponse.json(supplier, { status: 201 });
}
