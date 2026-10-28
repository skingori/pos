import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized } from "@/lib/api-auth";
import { completePendingSale } from "@/lib/sales";
import { writeAudit } from "@/lib/audit";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { payments: true },
  });
  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const mpesa = sale.payments.find((p) => p.method === "MPESA");
  if (!mpesa) {
    return NextResponse.json({ error: "No M-Pesa payment" }, { status: 400 });
  }

  if (mpesa.status === "PENDING" && mpesa.mpesaCheckoutId?.startsWith("MOCK")) {
    await prisma.payment.update({
      where: { id: mpesa.id },
      data: { status: "PAID", mpesaReceipt: `MOCK${Date.now()}` },
    });
  }

  const refreshed = await prisma.payment.findUnique({ where: { id: mpesa.id } });
  if (refreshed?.status !== "PAID") {
    return NextResponse.json(
      { error: "Waiting for M-Pesa payment", status: refreshed?.status },
      { status: 202 }
    );
  }

  const completed = await completePendingSale(id);
  await writeAudit({
    userId: user.id,
    action: "SALE_MPESA_CONFIRMED",
    entity: "Sale",
    entityId: id,
  });
  return NextResponse.json(completed);
}
