import { NextRequest, NextResponse } from "next/server";
import { PaymentMethod, SaleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized } from "@/lib/api-auth";
import { roundMoney } from "@/lib/money";
import { resolveBranchId } from "@/lib/branch";
import { stockFields } from "@/lib/branch-stock";
import { getSessionMoneyTotals } from "@/lib/session-totals";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function pctChange(today: number, yesterday: number) {
  if (yesterday <= 0) return today > 0 ? 100 : 0;
  return roundMoney(((today - yesterday) / yesterday) * 100);
}

const SALE_OK = {
  in: [SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED],
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  MPESA: "M-Pesa",
  CREDIT: "Credit account",
  CARD: "Card / bank",
  BANK: "Card / bank",
};

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();

  const branchId = await resolveBranchId(user);
  const daysRaw = Number(req.nextUrl.searchParams.get("days") || 7);
  const days = daysRaw === 30 || daysRaw === 90 ? daysRaw : 7;

  const todayStart = startOfDay();
  const yesterdayStart = addDays(todayStart, -1);
  const rangeStart = addDays(todayStart, -(days - 1));
  const prevRangeStart = addDays(rangeStart, -days);

  const [
    salesTodayRows,
    salesYesterdayRows,
    rangeSales,
    prevRangeSales,
    products,
    newCustomersToday,
    newCustomersYesterday,
    recentSales,
    rangeLines,
    pendingRefunds,
    debtors,
    receivablesAgg,
    debtorCustomers,
    todayPayments,
    heldSales,
    openSession,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: {
        status: SALE_OK,
        completedAt: { gte: todayStart },
        branchId,
      },
      select: { total: true, costTotal: true },
    }),
    prisma.sale.findMany({
      where: {
        status: SALE_OK,
        completedAt: { gte: yesterdayStart, lt: todayStart },
        branchId,
      },
      select: { total: true, costTotal: true },
    }),
    prisma.sale.findMany({
      where: {
        status: SALE_OK,
        completedAt: { gte: rangeStart },
        branchId,
      },
      select: { total: true, completedAt: true },
      orderBy: { completedAt: "asc" },
    }),
    prisma.sale.findMany({
      where: {
        status: SALE_OK,
        completedAt: { gte: prevRangeStart, lt: rangeStart },
        branchId,
      },
      select: { total: true, completedAt: true },
    }),
    prisma.product.findMany({
      where: { active: true, isReturnSku: false },
      include: {
        stocks: { where: { branchId } },
        category: true,
      },
    }),
    prisma.customer.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.customer.count({
      where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
    }),
    prisma.sale.findMany({
      where: { status: SALE_OK, branchId },
      orderBy: { completedAt: "desc" },
      take: 8,
      include: {
        customer: { select: { name: true } },
        lines: {
          take: 3,
          include: { product: { include: { category: true } } },
        },
        _count: { select: { lines: true } },
      },
    }),
    prisma.saleLine.findMany({
      where: {
        sale: {
          status: SALE_OK,
          completedAt: { gte: rangeStart },
          branchId,
        },
      },
      select: {
        productId: true,
        name: true,
        qty: true,
        lineTotal: true,
        unitCost: true,
        product: {
          select: {
            imageUrl: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.refundRequest.count({ where: { status: "PENDING" } }),
    prisma.customer.count({ where: { active: true, balance: { gt: 0 } } }),
    prisma.customer.aggregate({
      where: { active: true, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    prisma.customer.findMany({
      where: { active: true, balance: { gt: 0 } },
      orderBy: { balance: "desc" },
      take: 40,
      select: {
        id: true,
        name: true,
        balance: true,
        sales: {
          where: {
            status: SALE_OK,
            payments: { some: { method: "CREDIT" } },
          },
          orderBy: { completedAt: "asc" },
          take: 1,
          select: { completedAt: true, creditDueAt: true, createdAt: true },
        },
      },
    }),
    prisma.payment.findMany({
      where: {
        status: "PAID",
        createdAt: { gte: todayStart },
        sale: { branchId, status: SALE_OK },
      },
      select: { method: true, amount: true },
    }),
    prisma.heldSale.count({ where: { branchId } }),
    prisma.posSession.findFirst({
      where: { status: "OPEN", branchId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        openingFloat: true,
        createdAt: true,
        openedBy: { select: { name: true } },
      },
    }),
  ]);

  const salesToday = roundMoney(salesTodayRows.reduce((s, x) => s + x.total, 0));
  const costToday = roundMoney(salesTodayRows.reduce((s, x) => s + x.costTotal, 0));
  const profitToday = roundMoney(salesToday - costToday);
  const txnsToday = salesTodayRows.length;

  const salesYesterday = roundMoney(salesYesterdayRows.reduce((s, x) => s + x.total, 0));
  const costYesterday = roundMoney(salesYesterdayRows.reduce((s, x) => s + x.costTotal, 0));
  const profitYesterday = roundMoney(salesYesterday - costYesterday);
  const txnsYesterday = salesYesterdayRows.length;

  const withStock = products.map((p) => ({
    ...p,
    ...stockFields(p.stocks[0]),
  }));
  const stockValue = roundMoney(withStock.reduce((s, p) => s + p.cost * p.qty, 0));
  const lowStock = withStock
    .filter((p) => p.qty <= p.reorderLevel)
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      name: p.name,
      qty: p.qty,
      reorderLevel: p.reorderLevel,
      unit: p.unit,
      imageUrl: p.imageUrl,
      category: p.category?.name || "Uncategorized",
    }));
  const outOfStock = lowStock.filter((p) => p.qty <= 0).length;

  const dayKeys: string[] = [];
  for (let i = 0; i < days; i++) {
    dayKeys.push(addDays(rangeStart, i).toISOString().slice(0, 10));
  }
  const byDay = Object.fromEntries(dayKeys.map((k) => [k, 0]));
  for (const s of rangeSales) {
    if (!s.completedAt) continue;
    const k = s.completedAt.toISOString().slice(0, 10);
    if (k in byDay) byDay[k] = roundMoney(byDay[k] + s.total);
  }

  const prevByDay: number[] = [];
  for (let i = 0; i < days; i++) {
    const k = addDays(prevRangeStart, i).toISOString().slice(0, 10);
    prevByDay.push(0);
    for (const s of prevRangeSales) {
      if (!s.completedAt) continue;
      if (s.completedAt.toISOString().slice(0, 10) === k) {
        prevByDay[i] = roundMoney(prevByDay[i] + s.total);
      }
    }
  }

  const todayKey = todayStart.toISOString().slice(0, 10);
  const salesTrend = dayKeys.map((k, i) => {
    const d = addDays(rangeStart, i);
    const isToday = k === todayKey;
    const label = isToday
      ? "Today"
      : days <= 7
        ? d.toLocaleDateString("en-KE", { weekday: "short" })
        : d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
    return {
      date: k,
      label,
      sales: byDay[k],
      previous: prevByDay[i] || 0,
    };
  });

  const rangeTotal = roundMoney(salesTrend.reduce((s, d) => s + d.sales, 0));
  const prevRangeTotal = roundMoney(prevByDay.reduce((s, v) => s + v, 0));
  const dailyAverage = roundMoney(rangeTotal / Math.max(days, 1));
  const bestDay = salesTrend.reduce(
    (best, d) => (d.sales > best.sales ? d : best),
    salesTrend[0] || { date: "", label: "—", sales: 0, previous: 0 }
  );

  const catMap = new Map<string, { name: string; revenue: number }>();
  const productMap = new Map<
    string,
    {
      name: string;
      sold: number;
      revenue: number;
      cost: number;
      imageUrl: string | null;
      category: string;
    }
  >();
  for (const line of rangeLines) {
    const catName = line.product.category?.name || "Uncategorized";
    const cat = catMap.get(catName) || { name: catName, revenue: 0 };
    cat.revenue = roundMoney(cat.revenue + line.lineTotal);
    catMap.set(catName, cat);

    const prod = productMap.get(line.productId) || {
      name: line.name,
      sold: 0,
      revenue: 0,
      cost: 0,
      imageUrl: line.product.imageUrl,
      category: catName,
    };
    productMap.set(line.productId, {
      ...prod,
      sold: roundMoney(prod.sold + line.qty),
      revenue: roundMoney(prod.revenue + line.lineTotal),
      cost: roundMoney(prod.cost + line.unitCost * line.qty),
    });
  }

  const byCategory = [...catMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);
  const catTotal = byCategory.reduce((s, c) => s + c.revenue, 0) || 1;
  const salesByCategory = byCategory.map((c) => ({
    name: c.name,
    revenue: c.revenue,
    percent: roundMoney((c.revenue / catTotal) * 100),
  }));

  const topProducts = [...productMap.entries()]
    .map(([id, p]) => ({
      id,
      name: p.name,
      sold: p.sold,
      revenue: p.revenue,
      margin:
        p.revenue > 0
          ? roundMoney(((p.revenue - p.cost) / p.revenue) * 100)
          : 0,
      imageUrl: p.imageUrl,
      category: p.category,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const recentOrders = recentSales.map((s) => {
    const firstCat =
      s.lines.find((l) => l.product.category?.name)?.product.category?.name ||
      "General";
    return {
      id: s.id,
      receiptNo: s.receiptNo,
      customer: s.customer?.name || "Walk-in",
      category: firstCat,
      items: s._count.lines,
      total: s.total,
      completedAt: s.completedAt?.toISOString() || s.createdAt.toISOString(),
    };
  });

  const mixMap = new Map<string, number>();
  for (const p of todayPayments) {
    const label = METHOD_LABEL[p.method] || p.method;
    mixMap.set(label, roundMoney((mixMap.get(label) || 0) + p.amount));
  }
  const paymentMixTotal = [...mixMap.values()].reduce((s, v) => s + v, 0) || 1;
  const paymentMix = [...mixMap.entries()]
    .map(([name, amount]) => ({
      name,
      amount,
      share: roundMoney((amount / paymentMixTotal) * 100),
    }))
    .sort((a, b) => b.amount - a.amount);

  const now = Date.now();
  const dayMs = 86400000;
  const allDebtors = debtorCustomers.map((c) => {
    const oldest = c.sales[0];
    const anchor = oldest?.creditDueAt || oldest?.completedAt || oldest?.createdAt;
    const daysOutstanding = anchor
      ? Math.max(0, Math.floor((now - new Date(anchor).getTime()) / dayMs))
      : 0;
    return {
      id: c.id,
      name: c.name,
      owed: roundMoney(c.balance),
      days: daysOutstanding,
    };
  });
  const topDebtors = allDebtors.slice(0, 5);
  const receivablesTotal = roundMoney(receivablesAgg._sum.balance || 0);

  let ageing = { d0_30: 0, d31_60: 0, d60plus: 0 };
  for (const d of allDebtors) {
    if (d.days <= 30) ageing.d0_30 = roundMoney(ageing.d0_30 + d.owed);
    else if (d.days <= 60) ageing.d31_60 = roundMoney(ageing.d31_60 + d.owed);
    else ageing.d60plus = roundMoney(ageing.d60plus + d.owed);
  }
  const agedSum = ageing.d0_30 + ageing.d31_60 + ageing.d60plus;
  if (receivablesTotal > agedSum) {
    ageing.d0_30 = roundMoney(ageing.d0_30 + (receivablesTotal - agedSum));
  }

  let cashInDrawer: number | null = null;
  let registerLabel: string | null = null;
  if (openSession) {
    const totals = await getSessionMoneyTotals(openSession.id);
    cashInDrawer = totals.expectedCash;
    const opened = new Date(openSession.createdAt).toLocaleTimeString("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
    });
    registerLabel = `Open since ${opened}${
      openSession.openedBy?.name ? ` · ${openSession.openedBy.name}` : ""
    }`;
  }

  const avgBasket =
    txnsToday > 0 ? roundMoney(salesToday / txnsToday) : 0;
  const avgBasketYesterday =
    txnsYesterday > 0 ? roundMoney(salesYesterday / txnsYesterday) : 0;
  const grossMarginPct =
    salesToday > 0 ? roundMoney((profitToday / salesToday) * 100) : 0;
  const rangeGrossCost = roundMoney(
    rangeLines.reduce((s, l) => s + l.unitCost * l.qty, 0)
  );
  const rangeMarginPct =
    rangeTotal > 0
      ? roundMoney(((rangeTotal - rangeGrossCost) / rangeTotal) * 100)
      : 0;

  return NextResponse.json({
    days,
    salesToday,
    salesTodayChange: pctChange(salesToday, salesYesterday),
    profitToday,
    profitTodayChange: pctChange(profitToday, profitYesterday),
    grossMarginPct,
    rangeMarginPct,
    transactionsToday: txnsToday,
    transactionsTodayChange: pctChange(txnsToday, txnsYesterday),
    avgBasket,
    avgBasketChange: pctChange(avgBasket, avgBasketYesterday),
    newCustomersToday,
    newCustomersTodayChange: pctChange(newCustomersToday, newCustomersYesterday),
    stockValue,
    skuCount: withStock.length,
    lowStock,
    outOfStock,
    lowStockCount: lowStock.length,
    pendingRefunds,
    openReceivables: debtors,
    receivablesTotal,
    topDebtors,
    ageing,
    paymentMix,
    cashInDrawer,
    registerLabel,
    heldSales,
    salesTrend,
    rangeTotal,
    prevRangeTotal,
    rangeTotalChange: pctChange(rangeTotal, prevRangeTotal),
    dailyAverage,
    bestDay: { label: bestDay.label, sales: bestDay.sales },
    salesByCategory,
    topProducts,
    recentOrders,
    branchId,
    fastMoving: topProducts.map((p) => ({
      productId: p.id,
      name: p.name,
      sold: p.sold,
    })),
  });
}
