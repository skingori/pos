import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageUsers } from "@/lib/permissions";
import { getShopSettings } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";
import { zodErrorResponse } from "@/lib/api";

const patchSchema = z.object({
  shopName: z.string().min(1).optional(),
  defaultMarkupPercent: z.number().min(0).max(500).optional(),
  vatPercent: z.number().min(0).max(100).optional(),
  pricesIncludeVat: z.boolean().optional(),
  currency: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  kraPin: z.string().nullable().optional(),
  receiptFooter: z.string().optional(),
});

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const settings = await getShopSettings();
  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageUsers(user.role)) return forbidden();

  try {
    const body = patchSchema.parse(await req.json());
    await getShopSettings();
    const settings = await prisma.shopSettings.update({
      where: { id: "default" },
      data: body,
    });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "ShopSettings",
      entityId: settings.id,
      detail: JSON.stringify(body),
    });
    return NextResponse.json(settings);
  } catch (e) {
    return zodErrorResponse(e);
  }
}
