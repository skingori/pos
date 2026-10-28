import { prisma } from "./prisma";
import { roundMoney } from "./money";

export async function getSessionMoneyTotals(sessionId: string) {
  const [session, sales, refunds] = await Promise.all([
    prisma.posSession.findUnique({
      where: { id: sessionId },
      include: { movements: true },
    }),
    prisma.sale.findMany({
      where: {
        sessionId,
        status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] },
      },
      include: { payments: true },
    }),
    prisma.refundRequest.findMany({
      where: { sessionId, status: "APPROVED" },
    }),
  ]);

  if (!session) {
    return {
      cashSales: 0,
      mpesaSales: 0,
      cashRefunds: 0,
      mpesaRefunds: 0,
      creditRefunds: 0,
      cashIn: 0,
      cashOut: 0,
      expectedCash: 0,
      expectedMpesa: 0,
    };
  }

  let cashSales = 0;
  let mpesaSales = 0;
  for (const s of sales) {
    for (const p of s.payments) {
      if (p.status !== "PAID") continue;
      if (p.method === "CASH") cashSales += p.amount;
      if (p.method === "MPESA") mpesaSales += p.amount;
    }
  }

  let cashRefunds = 0;
  let mpesaRefunds = 0;
  let creditRefunds = 0;
  for (const r of refunds) {
    if (r.payoutMethod === "CASH") cashRefunds += r.amount;
    if (r.payoutMethod === "MPESA") mpesaRefunds += r.amount;
    if (r.payoutMethod === "CREDIT") creditRefunds += r.amount;
  }

  const cashIn = session.movements
    .filter((m) => m.type === "IN")
    .reduce((s, m) => s + m.amount, 0);
  // Cash refunds also create OUT movements; avoid double-counting those
  const cashOutManual = session.movements
    .filter((m) => m.type === "OUT" && !m.note?.startsWith("Refund payout"))
    .reduce((s, m) => s + m.amount, 0);

  const expectedCash = roundMoney(
    session.openingFloat + cashSales + cashIn - cashOutManual - cashRefunds
  );
  const expectedMpesa = roundMoney(mpesaSales - mpesaRefunds);

  return {
    cashSales: roundMoney(cashSales),
    mpesaSales: roundMoney(mpesaSales),
    cashRefunds: roundMoney(cashRefunds),
    mpesaRefunds: roundMoney(mpesaRefunds),
    creditRefunds: roundMoney(creditRefunds),
    cashIn: roundMoney(cashIn),
    cashOut: roundMoney(cashOutManual),
    expectedCash,
    expectedMpesa,
  };
}
