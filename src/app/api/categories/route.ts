import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageInventory } from "@/lib/permissions";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageInventory(user.role)) return forbidden();
  const body = await req.json();
  const category = await prisma.category.create({ data: { name: body.name } });
  return NextResponse.json(category, { status: 201 });
}
