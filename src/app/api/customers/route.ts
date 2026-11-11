import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { zodErrorResponse } from "@/lib/api";
import {
  getCustomerOpenCharges,
  setCustomerStoreCredit,
} from "@/lib/customer-account";
import { roundMoney } from "@/lib/money";
import { writeAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "customers.access") && !hasPermission(user, "pos.access")) {
    return forbidden();
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const owingOnly = req.nextUrl.searchParams.get("owing") === "1";
  const includeInactive = req.nextUrl.searchParams.get("inactive") === "1";
  const sort = req.nextUrl.searchParams.get("sort") || "outstanding";

  const customers = await prisma.customer.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      ...(owingOnly ? { balance: { gt: 0 } } : {}),
      ...(q
        ? {
            OR: [{ name: { contains: q } }, { phone: { contains: q } }],
          }
        : {}),
    },
    include: {
      priceLevel: true,
      payments: {
        where: { isWriteOff: false },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const now = new Date();
  const enriched = await Promise.all(
    customers.map(async (c) => {
      const charges = c.balance > 0.009 ? await getCustomerOpenCharges(c.id) : [];
      const overdue = charges.filter((ch) => ch.dueAt && new Date(ch.dueAt) < now);
      const oldestOverdue =
        overdue.length > 0
          ? [...overdue].sort(
              (a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime()
            )[0].dueAt
          : null;
      const last = c.payments[0] || null;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        creditLimit: c.creditLimit,
        balance: roundMoney(c.balance),
        active: c.active,
        createdAt: c.createdAt.toISOString(),
        priceLevel: c.priceLevel,
        priceLevelId: c.priceLevelId,
        openReceipts: charges.length,
        oldestOverdue,
        lastPayment: last
          ? { at: last.createdAt.toISOString(), amount: last.amount }
          : null,
      };
    })
  );

  enriched.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "last_payment") {
      const at = a.lastPayment?.at || "";
      const bt = b.lastPayment?.at || "";
      return bt.localeCompare(at);
    }
    // outstanding (default): largest first, then name
    if (b.balance !== a.balance) return b.balance - a.balance;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "customers.access")) return forbidden();
  try {
    const body = z
      .object({
        name: z.string().min(1),
        phone: z.string().nullable().optional(),
        email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
        creditLimit: z.number().min(0).optional(),
        storeCredit: z.number().min(0).optional(),
        priceLevelId: z.string().nullable().optional(),
      })
      .parse(await req.json());
    const canSetLimit =
      hasPermission(user, "customers.credit_limit") ||
      hasPermission(user, "customers.access");
    const customer = await prisma.customer.create({
      data: {
        name: body.name,
        phone: body.phone || null,
        email: body.email || null,
        creditLimit: canSetLimit ? body.creditLimit || 0 : 0,
        priceLevelId: body.priceLevelId || null,
      },
      include: { priceLevel: true },
    });

    if (body.storeCredit != null && body.storeCredit > 0.009) {
      try {
        await setCustomerStoreCredit({
          customerId: customer.id,
          targetCredit: body.storeCredit,
          userId: user.id,
          note: "Opening store credit",
        });
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof Error ? err.message : "Customer created but store credit failed",
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(customer, { status: 201 });
  } catch (e) {
    return zodErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "customers.access")) return forbidden();
  try {
    const body = z
      .object({
        id: z.string(),
        name: z.string().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        creditLimit: z.number().optional(),
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
          customerId: body.id,
          targetCredit: body.storeCredit,
          userId: user.id,
          note: "Edited on customers list",
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
      await writeAudit({
        userId: user.id,
        action: "UPDATE",
        entity: "Customer",
        entityId: body.id,
        detail: `edit store credit ${body.storeCredit}`,
      });
    }

    const customer = await prisma.customer.update({
      where: { id: body.id },
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
    return NextResponse.json(customer);
  } catch (e) {
    return zodErrorResponse(e);
  }
}
