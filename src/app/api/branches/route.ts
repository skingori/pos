import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageBranches } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { ensureMainBranch } from "@/lib/branch";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  await ensureMainBranch();
  const branches = await prisma.branch.findMany({
    orderBy: { code: "asc" },
    include: {
      _count: {
        select: { users: true, sales: true, stocks: true },
      },
    },
  });
  return NextResponse.json(branches);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageBranches(user.role)) return forbidden();

  const body = await req.json();
  const name = String(body.name || "").trim();
  const code = String(body.code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!name || !code) {
    return NextResponse.json({ error: "Name and code are required" }, { status: 400 });
  }

  try {
    const branch = await prisma.branch.create({
      data: {
        name,
        code,
        address: body.address || null,
        city: body.city || null,
        country: body.country || null,
        phone: body.phone || null,
        active: true,
      },
    });
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "Branch",
      entityId: branch.id,
      detail: `${branch.code} ${branch.name}`,
    });
    return NextResponse.json(branch, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Branch code already exists" }, { status: 400 });
  }
}
