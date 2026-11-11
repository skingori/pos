import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { zodErrorResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const all = req.nextUrl.searchParams.get("all") === "1";
  const now = new Date();
  const promotions = await prisma.promotion.findMany({
    where: all
      ? undefined
      : {
          active: true,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        },
    include: { product: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    ...(all ? { take: 200 } : {}),
  });
  return NextResponse.json(promotions);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "promotions.manage")) return forbidden();
  try {
    const body = z
      .object({
        name: z.string().min(1),
        percentOff: z.number().min(0).max(100),
        productId: z.string().nullable().optional(),
        startsAt: z.string().nullable().optional(),
        endsAt: z.string().nullable().optional(),
      })
      .parse(await req.json());
    const startsAt = parseOptionalDate(body.startsAt, "startsAt");
    if (!startsAt.ok) return NextResponse.json({ error: startsAt.error }, { status: 400 });
    const endsAt = parseOptionalDate(body.endsAt, "endsAt");
    if (!endsAt.ok) return NextResponse.json({ error: endsAt.error }, { status: 400 });
    const promotion = await prisma.promotion.create({
      data: {
        name: body.name,
        percentOff: body.percentOff,
        productId: body.productId || null,
        startsAt: startsAt.date,
        endsAt: endsAt.date,
      },
    });
    return NextResponse.json(promotion, { status: 201 });
  } catch (e) {
    return zodErrorResponse(e);
  }
}

function parseOptionalDate(value: string | null | undefined, field: string) {
  if (value == null || value === "") return { ok: true as const, date: null as Date | null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { ok: false as const, error: `Invalid ${field}` };
  }
  return { ok: true as const, date };
}

export async function PATCH(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "promotions.manage")) return forbidden();
  try {
    const body = z
      .object({
        id: z.string(),
        name: z.string().min(1).optional(),
        percentOff: z.number().min(0).max(100).optional(),
        productId: z.string().nullable().optional(),
        startsAt: z.string().nullable().optional(),
        endsAt: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(await req.json());

    const data: {
      name?: string;
      percentOff?: number;
      productId?: string | null;
      startsAt?: Date | null;
      endsAt?: Date | null;
      active?: boolean;
    } = {};

    if (body.name !== undefined) data.name = body.name;
    if (body.percentOff !== undefined) data.percentOff = body.percentOff;
    if (body.productId !== undefined) data.productId = body.productId || null;
    if (body.active !== undefined) data.active = body.active;

    if (body.startsAt !== undefined) {
      const parsed = parseOptionalDate(body.startsAt, "startsAt");
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      data.startsAt = parsed.date;
    }
    if (body.endsAt !== undefined) {
      const parsed = parseOptionalDate(body.endsAt, "endsAt");
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      data.endsAt = parsed.date;
    }

    const promotion = await prisma.promotion.update({
      where: { id: body.id },
      data,
      include: { product: { select: { id: true, name: true } } },
    });
    return NextResponse.json(promotion);
  } catch (e) {
    return zodErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "promotions.manage")) return forbidden();
  try {
    const body = z.object({ id: z.string() }).parse(await req.json());
    await prisma.promotion.delete({ where: { id: body.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return zodErrorResponse(e);
  }
}
