import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { completePendingSale } from "@/lib/sales";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = body?.Body?.stkCallback;
    const checkoutId = result?.CheckoutRequestID as string | undefined;
    const code = result?.ResultCode;

    if (!checkoutId) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const payment = await prisma.payment.findFirst({
      where: { mpesaCheckoutId: checkoutId },
    });
    if (!payment) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    if (code === 0) {
      const items = result?.CallbackMetadata?.Item || [];
      const receipt = items.find(
        (i: { Name: string }) => i.Name === "MpesaReceiptNumber"
      )?.Value;

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          mpesaReceipt: String(receipt || ""),
        },
      });

      // Mark other non-mpesa as already paid at create; complete sale
      await prisma.payment.updateMany({
        where: {
          saleId: payment.saleId,
          method: { not: "MPESA" },
          status: "PENDING",
        },
        data: { status: "PAID" },
      });

      await completePendingSale(payment.saleId);
    } else {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
      await prisma.sale.update({
        where: { id: payment.saleId },
        data: { status: "CANCELLED" },
      });
    }
  } catch {
    // always ack to Safaricom
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
