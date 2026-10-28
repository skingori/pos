import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canViewAudit } from "@/lib/permissions";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canViewAudit(user.role)) return forbidden();

  const logs = await prisma.auditLog.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(logs);
}
