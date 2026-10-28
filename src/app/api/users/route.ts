import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageUsers } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { zodErrorResponse } from "@/lib/api";
import { passwordPolicyError } from "@/lib/passwords";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageUsers(user.role)) return forbidden();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      mustChangePassword: true,
      branchId: true,
      branch: { select: { id: true, code: true, name: true } },
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageUsers(user.role)) return forbidden();
  try {
    const body = z
      .object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        role: z.nativeEnum(Role),
        branchId: z.string().optional().nullable(),
      })
      .parse(await req.json());
    const policy = passwordPolicyError(body.password);
    if (policy) return NextResponse.json({ error: policy }, { status: 400 });
    const created = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash: await bcrypt.hash(body.password, 12),
        role: body.role,
        mustChangePassword: true,
        branchId: body.branchId || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        branchId: true,
      },
    });
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "User",
      entityId: created.id,
      detail: created.email,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return zodErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageUsers(user.role)) return forbidden();
  try {
    const body = z
      .object({
        id: z.string(),
        name: z.string().optional(),
        role: z.nativeEnum(Role).optional(),
        active: z.boolean().optional(),
        branchId: z.string().optional().nullable(),
        password: z.string().min(8).optional(),
        mustChangePassword: z.boolean().optional(),
      })
      .parse(await req.json());
    if (body.password) {
      const policy = passwordPolicyError(body.password);
      if (policy) return NextResponse.json({ error: policy }, { status: 400 });
    }
    const updated = await prisma.user.update({
      where: { id: body.id },
      data: {
        name: body.name,
        role: body.role,
        active: body.active,
        ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
        ...(body.mustChangePassword != null
          ? { mustChangePassword: body.mustChangePassword }
          : {}),
        ...(body.password
          ? {
              passwordHash: await bcrypt.hash(body.password, 12),
              mustChangePassword: true,
            }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "User",
      entityId: updated.id,
    });
    return NextResponse.json(updated);
  } catch (e) {
    return zodErrorResponse(e);
  }
}
