import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { hasPermission, normalizePermissions, PERMISSIONS } from "@/lib/permissions";
import {
  ensureSystemAccessGroups,
  getGroupPermissions,
  setGroupPermissions,
  slugifyGroupCode,
} from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { zodErrorResponse } from "@/lib/api";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "users.manage") && !hasPermission(user, "roles.manage")) {
    return forbidden();
  }

  try {
    await ensureSystemAccessGroups();
  } catch (e) {
    console.error("ensureSystemAccessGroups failed", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Failed to initialize access groups. Restart the dev server after prisma generate.",
      },
      { status: 500 }
    );
  }
  const groups = await prisma.accessGroup.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: {
      permissions: { select: { permission: true } },
      _count: { select: { users: true } },
    },
  });

  return NextResponse.json({
    permissions: PERMISSIONS,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      code: g.code,
      description: g.description,
      isSystem: g.isSystem,
      userCount: g._count.users,
      permissions: normalizePermissions(g.permissions.map((p) => p.permission)),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "roles.manage")) return forbidden();

  try {
    const body = z
      .object({
        name: z.string().min(1).max(80),
        code: z.string().min(1).max(40).optional(),
        description: z.string().max(240).optional().nullable(),
        permissions: z.array(z.string()).default([]),
      })
      .parse(await req.json());

    await ensureSystemAccessGroups();
    let code = slugifyGroupCode(body.code || body.name);
    const reserved = new Set(["ADMIN", "MANAGER", "ATTENDANT"]);
    if (reserved.has(code)) {
      code = `${code}_CUSTOM`;
    }
    const existing = await prisma.accessGroup.findUnique({ where: { code } });
    if (existing) {
      code = `${code}_${Date.now().toString(36).toUpperCase().slice(-4)}`;
    }

    const group = await prisma.accessGroup.create({
      data: {
        name: body.name.trim(),
        code,
        description: body.description?.trim() || null,
        isSystem: false,
      },
    });
    const permissions = await setGroupPermissions(group.id, body.permissions);
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "AccessGroup",
      entityId: group.id,
      detail: `${group.code} · ${permissions.length} permissions`,
    });
    return NextResponse.json({ ...group, permissions, userCount: 0 }, { status: 201 });
  } catch (e) {
    return zodErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "roles.manage")) return forbidden();

  try {
    const body = z
      .object({
        id: z.string(),
        name: z.string().min(1).max(80).optional(),
        description: z.string().max(240).optional().nullable(),
        permissions: z.array(z.string()).optional(),
      })
      .parse(await req.json());

    const group = await prisma.accessGroup.findUnique({ where: { id: body.id } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.accessGroup.update({
      where: { id: body.id },
      data: {
        name: body.name?.trim(),
        description:
          body.description === undefined ? undefined : body.description?.trim() || null,
      },
    });

    let permissions = await getGroupPermissions(group.id);
    if (body.permissions) {
      permissions = await setGroupPermissions(group.id, body.permissions);
    }

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "AccessGroup",
      entityId: group.id,
      detail: group.code,
    });
    return NextResponse.json({ ...updated, permissions });
  } catch (e) {
    return zodErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "roles.manage")) return forbidden();

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const group = await prisma.accessGroup.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (group.isSystem) {
    return NextResponse.json({ error: "System groups cannot be deleted" }, { status: 400 });
  }
  if (group._count.users > 0) {
    return NextResponse.json(
      { error: "Reassign users before deleting this group" },
      { status: 400 }
    );
  }

  await prisma.accessGroup.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    action: "DELETE",
    entity: "AccessGroup",
    entityId: id,
    detail: group.code,
  });
  return NextResponse.json({ ok: true });
}
