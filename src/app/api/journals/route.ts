import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized } from "@/lib/api-auth";
import { ensureChartOfAccounts } from "@/lib/gl";

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();

  await ensureChartOfAccounts();

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const sourceType = req.nextUrl.searchParams.get("sourceType");

  const dateFilter =
    from || to
      ? {
          date: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {};

  const [accounts, entries, lineSums] = await Promise.all([
    prisma.account.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.journalEntry.findMany({
      where: {
        ...dateFilter,
        ...(sourceType ? { sourceType } : {}),
      },
      include: {
        lines: { include: { account: true }, orderBy: { debit: "desc" } },
      },
      orderBy: { date: "desc" },
      take: 200,
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: {
        entry: dateFilter,
      },
      _sum: { debit: true, credit: true },
    }),
  ]);

  const sumByAccount = Object.fromEntries(
    lineSums.map((s) => [s.accountId, s._sum])
  );

  const balances = accounts.map((a) => {
    const sum = sumByAccount[a.id];
    const debit = sum?.debit || 0;
    const credit = sum?.credit || 0;
    return { ...a, debit, credit, balance: debit - credit };
  });

  return NextResponse.json({ accounts: balances, entries });
}
