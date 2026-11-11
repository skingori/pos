import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import {
  buildCustomerLedger,
  getCustomerOpenCharges,
  reconcileCustomerBalance,
  setCustomerStoreCredit,
} from "@/lib/customer-account";
import { roundMoney } from "@/lib/money";
import { zodErrorResponse } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await apiUser();
  if (!user) return unauthorized();

  const { id } = await ctx.params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { priceLevel: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const [ledger, openCharges, payments] = await Promise.all([
    buildCustomerLedger(id),
    getCustomerOpenCharges(id),
    prisma.customerPayment.findMany({
      where: { customerId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const closing = roundMoney(
    ledger.find((e) => e.type === "CLOSING")?.balanceAfter ?? 0
  );
  const stored = roundMoney(customer.balance);
  if (Math.abs(stored - closing) > 0.009) {
    await reconcileCustomerBalance(id, closing);
  }

  const balance = closing;
  return NextResponse.json({
    customer: { ...customer, balance },
    ledger,
    openCharges,
    payments,
    summary: {
      balance,
      owed: Math.max(0, balance),
      storeCredit: Math.max(0, -balance),
      creditLimit: customer.creditLimit,
      openReceipts: openCharges.length,
      openDue: roundMoney(openCharges.reduce((s, c) => s + c.openAmount, 0)),
      availableCredit:
        customer.creditLimit > 0
          ? roundMoney(Math.max(0, customer.creditLimit - balance))
          : null,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "customers.access")) return forbidden();

  const { id } = await ctx.params;
  try {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        creditLimit: z.number().min(0).optional(),
        storeCredit: z.number().min(0).optional(),
        priceLevelId: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(await req.json());

    const canSetLimit =
      hasPermission(user, "customers.credit_limit") ||
      hasPermission(user, "customers.access");

    if (body.storeCredit !== undefined) {
      try {
        await setCustomerStoreCredit({
          customerId: id,
          targetCredit: body.storeCredit,
          userId: user.id,
          note: "Edited on customer profile",
        });
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof Error ? err.message : "Could not update store credit",
          },
          { status: 400 }
        );
      }
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name: body.name,
        phone: body.phone,
        email: body.email,
        ...(canSetLimit && body.creditLimit !== undefined
          ? { creditLimit: body.creditLimit }
          : {}),
        priceLevelId: body.priceLevelId,
        active: body.active,
      },
      include: { priceLevel: true },
    });

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Customer",
      entityId: customer.id,
      detail:
        body.storeCredit !== undefined
          ? `edit store credit ${body.storeCredit}`
          : body.active === false
            ? "deactivate"
            : body.active === true
              ? "activate"
              : "edit",
    });

    return NextResponse.json(customer);
  } catch (e) {
    return zodErrorResponse(e);
  }
}
