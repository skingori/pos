import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized } from "@/lib/api-auth";
import { roundMoney } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import { format } from "date-fns";
import { resolveBranchId } from "@/lib/branch";
import { stockFields } from "@/lib/branch-stock";

function range(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const start = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
  const end = to ? new Date(to) : new Date();
  return { start, end };
}

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();

  const branchId = await resolveBranchId(user);
  const { start, end } = range(req);
  const formatOut = req.nextUrl.searchParams.get("format");
  const type = req.nextUrl.searchParams.get("type") || "summary";

  const [sales, productRows, customers, refunds] = await Promise.all([
    prisma.sale.findMany({
      where: {
        status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] },
        completedAt: { gte: start, lte: end },
        branchId,
      },
      include: {
        cashier: true,
        customer: true,
        lines: { include: { product: { include: { category: true } } } },
        payments: true,
      },
      orderBy: { completedAt: "desc" },
    }),
    prisma.product.findMany({
      where: { active: true },
      include: { category: true, stocks: { where: { branchId } } },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({
      where: { active: true, balance: { gt: 0 } },
      orderBy: { balance: "desc" },
    }),
    prisma.refundRequest.findMany({
      where: {
        status: "APPROVED",
        reviewedAt: { gte: start, lte: end },
        sale: { branchId },
      },
      include: {
        sale: true,
        lines: { include: { product: true } },
      },
    }),
  ]);

  const products = productRows.map((p) => {
    const stock = stockFields(p.stocks[0]);
    const { stocks: _s, ...rest } = p;
    return { ...rest, ...stock };
  });

  if (type === "sales" && formatOut === "csv") {
    const rows = sales.map((s) => ({
      receipt: s.receiptNo,
      date: s.completedAt?.toISOString() || "",
      cashier: s.cashier.name,
      customer: s.customer?.name || "Walk-in",
      subtotal: s.subtotal,
      discount: s.discount,
      tax: s.taxAmount,
      total: s.total,
      cost: s.costTotal,
      profit: roundMoney(s.total - s.costTotal),
      status: s.status,
    }));
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="sales-${start.toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  if (type === "inventory" && formatOut === "csv") {
    const rows = products.map((p) => ({
      name: p.name,
      sku: p.sku,
      category: p.category?.name || "",
      buying: p.cost,
      sell: p.sellPrice,
      sellableQty: p.qty,
      openedQty: p.openedQty,
      reorderLevel: p.reorderLevel,
      stockValue: roundMoney(p.cost * p.qty),
      retailValue: roundMoney(p.sellPrice * p.qty),
      status: p.qty <= p.reorderLevel ? "Reorder" : "OK",
    }));
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=inventory.csv",
      },
    });
  }

  if (type === "customers" && formatOut === "csv") {
    const rows = customers.map((c) => ({
      name: c.name,
      phone: c.phone || "",
      balance: c.balance,
      creditLimit: c.creditLimit,
    }));
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=receivables.csv",
      },
    });
  }

  const completed = sales.filter((s) => s.status !== "REFUNDED");
  const salesTotal = roundMoney(completed.reduce((s, x) => s + x.total, 0));
  const taxTotal = roundMoney(completed.reduce((s, x) => s + x.taxAmount, 0));
  const costTotal = roundMoney(completed.reduce((s, x) => s + x.costTotal, 0));
  const discountTotal = roundMoney(completed.reduce((s, x) => s + x.discount, 0));
  const profit = roundMoney(salesTotal - costTotal);
  const refundTotal = roundMoney(refunds.reduce((s, r) => s + r.amount, 0));

  const byCashier: Record<string, { name: string; sales: number; txns: number; profit: number }> = {};
  const byPayment: Record<string, number> = {};
  const byCustomer: Record<string, { name: string; sales: number; txns: number }> = {};
  const byCategory: Record<string, { name: string; qty: number; revenue: number }> = {};
  const daily: Record<string, { date: string; sales: number; profit: number; txns: number }> = {};
  const itemMap: Record<
    string,
    { name: string; sku: string; qty: number; revenue: number; cost: number; profit: number }
  > = {};

  for (const s of completed) {
    const day = s.completedAt ? format(s.completedAt, "yyyy-MM-dd") : "unknown";
    const d = daily[day] || { date: day, sales: 0, profit: 0, txns: 0 };
    d.sales = roundMoney(d.sales + s.total);
    d.profit = roundMoney(d.profit + (s.total - s.costTotal));
    d.txns += 1;
    daily[day] = d;

    const c = byCashier[s.cashierId] || {
      name: s.cashier.name,
      sales: 0,
      txns: 0,
      profit: 0,
    };
    c.sales = roundMoney(c.sales + s.total);
    c.profit = roundMoney(c.profit + (s.total - s.costTotal));
    c.txns += 1;
    byCashier[s.cashierId] = c;

    const custKey = s.customerId || "walkin";
    const cust = byCustomer[custKey] || {
      name: s.customer?.name || "Walk-in",
      sales: 0,
      txns: 0,
    };
    cust.sales = roundMoney(cust.sales + s.total);
    cust.txns += 1;
    byCustomer[custKey] = cust;

    for (const p of s.payments) {
      if (p.status !== "PAID") continue;
      byPayment[p.method] = roundMoney((byPayment[p.method] || 0) + p.amount);
    }

    for (const l of s.lines) {
      const row = itemMap[l.productId] || {
        name: l.name,
        sku: l.product?.sku || "",
        qty: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };
      row.qty += l.qty;
      row.revenue = roundMoney(row.revenue + l.lineTotal);
      row.cost = roundMoney(row.cost + l.unitCost * l.qty);
      row.profit = roundMoney(row.revenue - row.cost);
      itemMap[l.productId] = row;

      const catName = l.product?.category?.name || "Uncategorized";
      const cat = byCategory[catName] || { name: catName, qty: 0, revenue: 0 };
      cat.qty += l.qty;
      cat.revenue = roundMoney(cat.revenue + l.lineTotal);
      byCategory[catName] = cat;
    }
  }

  const inventoryValue = roundMoney(products.reduce((s, p) => s + p.cost * p.qty, 0));
  const retailValue = roundMoney(products.reduce((s, p) => s + p.sellPrice * p.qty, 0));
  const openedValue = roundMoney(
    products.reduce((s, p) => s + p.cost * (p.openedQty || 0), 0)
  );

  const stockStatus = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category?.name || "—",
    qty: p.qty,
    openedQty: p.openedQty,
    reorderLevel: p.reorderLevel,
    cost: p.cost,
    sellPrice: p.sellPrice,
    stockValue: roundMoney(p.cost * p.qty),
    retailValue: roundMoney(p.sellPrice * p.qty),
    status: p.qty <= 0 ? "Out" : p.qty <= p.reorderLevel ? "Reorder" : "OK",
  }));

  const salesTable = completed.map((s) => ({
    id: s.id,
    receiptNo: s.receiptNo,
    date: s.completedAt?.toISOString() || "",
    cashier: s.cashier.name,
    customer: s.customer?.name || "Walk-in",
    items: s.lines.reduce((n, l) => n + l.qty, 0),
    tax: s.taxAmount,
    total: s.total,
    profit: roundMoney(s.total - s.costTotal),
    payments: s.payments
      .filter((p) => p.status === "PAID")
      .map((p) => p.method)
      .join("+"),
    status: s.status,
  }));

  return NextResponse.json({
    from: start.toISOString(),
    to: end.toISOString(),
    salesTotal,
    taxTotal,
    discountTotal,
    costTotal,
    profit,
    refundTotal,
    transactions: completed.length,
    byCashier: Object.values(byCashier).sort((a, b) => b.sales - a.sales),
    byPayment: Object.entries(byPayment).map(([method, amount]) => ({
      method,
      amount,
    })),
    byCustomer: Object.values(byCustomer)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 50),
    byCategory: Object.values(byCategory).sort((a, b) => b.revenue - a.revenue),
    dailySales: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
    topItems: Object.values(itemMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50),
    inventoryValue,
    retailValue,
    openedValue,
    stockStatus,
    lowStockCount: stockStatus.filter((s) => s.status !== "OK").length,
    receivables: customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      balance: c.balance,
      creditLimit: c.creditLimit,
    })),
    receivablesTotal: roundMoney(customers.reduce((s, c) => s + c.balance, 0)),
    salesTable,
    refunds: refunds.map((r) => ({
      id: r.id,
      receiptNo: r.sale.receiptNo,
      amount: r.amount,
      date: r.reviewedAt?.toISOString() || r.createdAt.toISOString(),
      items: r.lines.map((l) => `${l.product.name}×${l.qty} (${l.condition})`).join("; "),
    })),
  });
}
