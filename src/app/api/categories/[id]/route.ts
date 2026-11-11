import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "inventory.manage")) return forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const clash = await prisma.category.findUnique({ where: { name } });
  if (clash && clash.id !== id) {
    return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
  }

  try {
    const category = await prisma.category.update({
      where: { id },
      data: { name },
    });
    return NextResponse.json(category);
  } catch (e) {
    console.error("update category failed", e);
    return NextResponse.json({ error: "Could not rename category" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "inventory.manage")) return forbidden();

  const { id } = await params;
  const existing = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  try {
    await prisma.$transaction([
      prisma.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      prisma.category.delete({ where: { id } }),
    ]);
    return NextResponse.json({
      ok: true,
      deleted: true,
      unlinkedProducts: existing._count.products,
    });
  } catch (e) {
    console.error("delete category failed", e);
    return NextResponse.json({ error: "Could not delete category" }, { status: 500 });
  }
}
