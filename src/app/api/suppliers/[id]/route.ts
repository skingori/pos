import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "purchasing.manage")) return forbidden();

  const { id } = await params;
  const body = await req.json();
  const data: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    active?: boolean;
  } = {};

  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if ("phone" in body) data.phone = body.phone ? String(body.phone) : null;
  if ("email" in body) data.email = body.email ? String(body.email) : null;
  if (typeof body.active === "boolean") data.active = body.active;

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const supplier = await prisma.supplier.update({ where: { id }, data });
    return NextResponse.json(supplier);
  } catch {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "purchasing.manage")) return forbidden();

  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: { _count: { select: { purchases: true } } },
  });
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  if (supplier._count.purchases > 0) {
    const updated = await prisma.supplier.update({
      where: { id },
      data: { active: false },
    });
    return NextResponse.json({
      ...updated,
      softDeleted: true,
      message: "Supplier has purchases — deactivated instead of deleted",
    });
  }

  await prisma.supplier.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: true });
}
