import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { BRANCH_COOKIE, canSwitchBranch, resolveBranch } from "@/lib/branch";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const branch = await resolveBranch(user);
  return NextResponse.json(branch);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canSwitchBranch(user.role)) return forbidden();

  const body = await req.json();
  const branchId = String(body.branchId || "");
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, active: true },
  });
  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const open = await prisma.posSession.findFirst({
    where: {
      status: "OPEN",
      OR: [{ openedById: user.id }, ...(user.branchId ? [{ branchId: user.branchId }] : [])],
    },
  });
  if (open) {
    return NextResponse.json(
      { error: "Close the till before switching branch" },
      { status: 400 }
    );
  }

  const jar = await cookies();
  jar.set(BRANCH_COOKIE, branch.id, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  });
  return NextResponse.json(branch);
}
