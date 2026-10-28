import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized } from "@/lib/api-auth";
import { passwordPolicyError } from "@/lib/passwords";
import { writeAudit } from "@/lib/audit";
import { zodErrorResponse } from "@/lib/api";

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();

  try {
    const body = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      })
      .parse(await req.json());

    const policy = passwordPolicyError(body.newPassword);
    if (policy) {
      return NextResponse.json({ error: policy }, { status: 400 });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return unauthorized();

    const ok = await bcrypt.compare(body.currentPassword, dbUser.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Current password is wrong" }, { status: 400 });
    }

    if (body.currentPassword === body.newPassword) {
      return NextResponse.json(
        { error: "New password must be different from the current one" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(body.newPassword, 12),
        mustChangePassword: false,
      },
    });

    await writeAudit({
      userId: user.id,
      action: "PASSWORD_CHANGE",
      entity: "User",
      entityId: user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return zodErrorResponse(e);
  }
}
