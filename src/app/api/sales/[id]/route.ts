import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized } from "@/lib/api-auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      lines: true,
      payments: true,
      customer: true,
      cashier: true,
      refunds: { include: { lines: true } },
    },
  });
  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(sale);
}
