import { NextRequest, NextResponse } from "next/server";
import { SaleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized } from "@/lib/api-auth";
import { roundMoney } from "@/lib/money";
import { resolveBranchId } from "@/lib/branch";
import { stockFields } from "@/lib/branch-stock";

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

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();

  const branchId = await resolveBranchId(user);
  const daysRaw = Number(req.nextUrl.searchParams.get("days") || 7);
  const days = daysRaw === 30 || daysRaw === 90 ? daysRaw : 7;

  const todayStart = startOfDay();
  const yesterdayStart = addDays(todayStart, -1);
  const rangeStart = addDays(todayStart, -(days - 1));

  const [
    salesTodayRows,
    salesYesterdayRows,
    rangeSales,
    products,
    newCustomersToday,
    newCustomersYesterday,
    recentSales,
    rangeLines,
    pendingRefunds,
    debtors,
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
  const todayKey = todayStart.toISOString().slice(0, 10);
  const salesTrend = dayKeys.map((k, i) => {
    const d = addDays(rangeStart, i);
    const isToday = k === todayKey;
    const label = isToday
      ? "Today"
      : days <= 7
        ? d.toLocaleDateString("en-KE", { weekday: "short" })
        : d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
    return { date: k, label, sales: byDay[k] };
  });

  const rangeTotal = roundMoney(salesTrend.reduce((s, d) => s + d.sales, 0));
  const dailyAverage = roundMoney(rangeTotal / Math.max(days, 1));

  const catMap = new Map<string, { name: string; revenue: number }>();
  const productMap = new Map<
    string,
    { name: string; sold: number; imageUrl: string | null; category: string }
  >();
  for (const line of rangeLines) {
    const catName = line.product.category?.name || "Uncategorized";
    const cat = catMap.get(catName) || { name: catName, revenue: 0 };
    cat.revenue = roundMoney(cat.revenue + line.lineTotal);
    catMap.set(catName, cat);

    const prod =
      productMap.get(line.productId) ||
      ({
        name: line.name,
        sold: 0,
        imageUrl: line.product.imageUrl,
        category: catName,
      } as const);
    productMap.set(line.productId, {
      ...prod,
      sold: roundMoney(prod.sold + line.qty),
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
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 5);

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

  return NextResponse.json({
    days,
    salesToday,
    salesTodayChange: pctChange(salesToday, salesYesterday),
    profitToday,
    profitTodayChange: pctChange(profitToday, profitYesterday),
    transactionsToday: txnsToday,
    transactionsTodayChange: pctChange(txnsToday, txnsYesterday),
    newCustomersToday,
    newCustomersTodayChange: pctChange(newCustomersToday, newCustomersYesterday),
    stockValue,
    lowStock,
    outOfStock,
    lowStockCount: lowStock.length,
    pendingRefunds,
    openReceivables: debtors,
    salesTrend,
    rangeTotal,
    dailyAverage,
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
