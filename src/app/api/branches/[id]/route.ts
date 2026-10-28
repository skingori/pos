import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageBranches } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { MAIN_BRANCH_CODE } from "@/lib/branch";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageBranches(user.role)) return forbidden();

  const { id } = await params;
  const existing = await prisma.branch.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  if (body.action === "deactivate") {
    if (existing.code === MAIN_BRANCH_CODE) {
      return NextResponse.json({ error: "Cannot deactivate Main branch" }, { status: 400 });
    }
    const branch = await prisma.branch.update({
      where: { id },
      data: { active: false },
    });
    await writeAudit({
      userId: user.id,
      action: "DEACTIVATE",
      entity: "Branch",
      entityId: id,
      detail: branch.code,
    });
    return NextResponse.json(branch);
  }

  if (body.action === "activate") {
    const branch = await prisma.branch.update({
      where: { id },
      data: { active: true },
    });
    return NextResponse.json(branch);
  }

  const name = body.name != null ? String(body.name).trim() : existing.name;
  const code =
    body.code != null
      ? String(body.code).trim().toUpperCase().replace(/\s+/g, "")
      : existing.code;
  if (!name || !code) {
    return NextResponse.json({ error: "Name and code are required" }, { status: 400 });
  }
  if (existing.code === MAIN_BRANCH_CODE && code !== MAIN_BRANCH_CODE) {
    return NextResponse.json({ error: "Cannot change Main branch code" }, { status: 400 });
  }

  try {
    const branch = await prisma.branch.update({
      where: { id },
      data: {
        name,
        code,
        address: body.address === undefined ? existing.address : body.address || null,
        city: body.city === undefined ? existing.city : body.city || null,
        country: body.country === undefined ? existing.country : body.country || null,
        phone: body.phone === undefined ? existing.phone : body.phone || null,
      },
    });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Branch",
      entityId: id,
      detail: `${branch.code} ${branch.name}`,
    });
    return NextResponse.json(branch);
  } catch {
    return NextResponse.json({ error: "Branch code already exists" }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageBranches(user.role)) return forbidden();

  const { id } = await params;
  const existing = await prisma.branch.findUnique({
    where: { id },
    include: {
      _count: { select: { users: true, sales: true, stocks: true, sessions: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.code === MAIN_BRANCH_CODE) {
    return NextResponse.json({ error: "Cannot delete Main branch" }, { status: 400 });
  }
  if (existing.active) {
    return NextResponse.json({ error: "Deactivate the branch first" }, { status: 400 });
  }
  const stockWithQty = await prisma.branchStock.count({
    where: {
      branchId: id,
      OR: [{ qty: { gt: 0 } }, { openedQty: { gt: 0 } }],
    },
  });
  if (
    existing._count.users > 0 ||
    existing._count.sales > 0 ||
    existing._count.sessions > 0 ||
    stockWithQty > 0
  ) {
    return NextResponse.json(
      { error: "Branch still has staff, sales, sessions, or stock" },
      { status: 400 }
    );
  }

  await prisma.branchStock.deleteMany({ where: { branchId: id } });
  await prisma.branch.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    action: "DELETE",
    entity: "Branch",
    entityId: id,
    detail: existing.code,
  });
  return NextResponse.json({ ok: true });
}
