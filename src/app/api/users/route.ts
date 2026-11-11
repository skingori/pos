import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { hasPermission, normalizePermissions } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { zodErrorResponse } from "@/lib/api";
import { passwordPolicyError } from "@/lib/passwords";
import {
  ensureSystemAccessGroups,
  getGroupPermissions,
  getRoleTemplatePermissions,
  getUserPermissions,
  roleFromGroupCode,
  setUserPermissions,
} from "@/lib/rbac";

async function assertCanStripUsersManage(
  actorId: string,
  targetId: string,
  nextPermissions: string[] | undefined
) {
  if (!nextPermissions) return null;
  const next = normalizePermissions(nextPermissions);
  if (next.includes("users.manage")) return null;
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, active: true },
  });
  if (!target?.active) return null;
  const current = await getUserPermissions(targetId);
  if (!current.includes("users.manage")) return null;
  const admins = await prisma.user.findMany({
    where: { active: true },
    select: { id: true },
  });
  let othersWithManage = 0;
  for (const a of admins) {
    if (a.id === targetId) continue;
    const perms = await getUserPermissions(a.id);
    if (perms.includes("users.manage")) othersWithManage += 1;
  }
  if (othersWithManage === 0) {
    return NextResponse.json(
      { error: "Cannot remove users.manage from the last admin" },
      { status: 400 }
    );
  }
  if (actorId === targetId) {
    return NextResponse.json(
      { error: "Cannot remove your own users.manage permission" },
      { status: 400 }
    );
  }
  return null;
}

async function resolveGroupAndRole(
  groupId: string | null | undefined,
  role?: Role
): Promise<
  | { error: string }
  | { groupId: string | null; role: Role; template: string[] }
> {
  await ensureSystemAccessGroups();
  if (groupId) {
    const group = await prisma.accessGroup.findUnique({ where: { id: groupId } });
    if (!group) return { error: "Group not found" };
    const permissions = await getGroupPermissions(group.id);
    return {
      groupId: group.id,
      role: roleFromGroupCode(group.code),
      template: permissions,
    };
  }
  const resolvedRole = role || Role.ATTENDANT;
  const code =
    resolvedRole === Role.ADMIN
      ? "ADMIN"
      : resolvedRole === Role.MANAGER
        ? "MANAGER"
        : "ATTENDANT";
  const group = await prisma.accessGroup.findUnique({ where: { code } });
  const template = await getRoleTemplatePermissions(resolvedRole);
  return {
    groupId: group?.id || null,
    role: resolvedRole,
    template,
  };
}

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "users.manage")) return forbidden();
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
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      groupId: true,
      group: { select: { id: true, name: true, code: true, isSystem: true } },
      active: true,
      mustChangePassword: true,
      branchId: true,
      branch: { select: { id: true, code: true, name: true } },
      createdAt: true,
      permissions: { select: { permission: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(
    users.map((u) => ({
      ...u,
      permissions: normalizePermissions(u.permissions.map((p) => p.permission)),
    }))
  );
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "users.manage")) return forbidden();
  try {
    const body = z
      .object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        role: z.nativeEnum(Role).optional(),
        groupId: z.string().optional().nullable(),
        branchId: z.string().optional().nullable(),
        permissions: z.array(z.string()).optional(),
      })
      .parse(await req.json());
    const policy = passwordPolicyError(body.password);
    if (policy) return NextResponse.json({ error: policy }, { status: 400 });

    const resolved = await resolveGroupAndRole(body.groupId, body.role);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    const permissions = normalizePermissions(body.permissions ?? resolved.template);

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.user.create({
        data: {
          name: body.name,
          email: body.email.toLowerCase(),
          passwordHash: await bcrypt.hash(body.password, 12),
          role: resolved.role,
          groupId: resolved.groupId,
          mustChangePassword: true,
          branchId: body.branchId || null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          groupId: true,
          active: true,
          branchId: true,
        },
      });
      await setUserPermissions(row.id, permissions, tx);
      return row;
    });

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "User",
      entityId: created.id,
      detail: `${created.email} · ${permissions.length} permissions`,
    });
    return NextResponse.json({ ...created, permissions }, { status: 201 });
  } catch (e) {
    return zodErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "users.manage")) return forbidden();
  try {
    const body = z
      .object({
        id: z.string(),
        name: z.string().optional(),
        role: z.nativeEnum(Role).optional(),
        groupId: z.string().optional().nullable(),
        active: z.boolean().optional(),
        branchId: z.string().optional().nullable(),
        password: z.string().min(8).optional(),
        mustChangePassword: z.boolean().optional(),
        permissions: z.array(z.string()).optional(),
        resetPermissionsToRole: z.boolean().optional(),
        resetPermissionsToGroup: z.boolean().optional(),
      })
      .parse(await req.json());
    if (body.password) {
      const policy = passwordPolicyError(body.password);
      if (policy) return NextResponse.json({ error: policy }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let nextRole: Role = body.role || existing.role;
    let nextGroupId: string | null =
      body.groupId === undefined ? existing.groupId : body.groupId;
    let nextPermissions = body.permissions;

    if (body.groupId !== undefined || body.resetPermissionsToGroup || body.resetPermissionsToRole) {
      const resolved = await resolveGroupAndRole(
        body.groupId !== undefined ? body.groupId : existing.groupId,
        body.role || existing.role
      );
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
      nextRole = resolved.role;
      nextGroupId = resolved.groupId;
      if (body.resetPermissionsToGroup || body.resetPermissionsToRole || body.permissions == null) {
        if (
          body.resetPermissionsToGroup ||
          body.resetPermissionsToRole ||
          (body.groupId !== undefined && body.groupId !== existing.groupId)
        ) {
          nextPermissions = resolved.template;
        }
      }
    } else if (body.role && body.role !== existing.role && body.permissions == null) {
      const resolved = await resolveGroupAndRole(null, body.role);
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
      nextRole = resolved.role;
      nextGroupId = resolved.groupId;
      nextPermissions = resolved.template;
    }

    const blocked = await assertCanStripUsersManage(user.id, body.id, nextPermissions);
    if (blocked) return blocked;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: body.id },
        data: {
          name: body.name,
          role: nextRole,
          groupId: nextGroupId,
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
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          groupId: true,
          active: true,
        },
      });
      if (nextPermissions) {
        await setUserPermissions(row.id, nextPermissions, tx);
      }
      return row;
    });

    const permissions = await getUserPermissions(updated.id);
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "User",
      entityId: updated.id,
      detail: nextPermissions ? `${permissions.length} permissions` : undefined,
    });
    return NextResponse.json({ ...updated, permissions });
  } catch (e) {
    return zodErrorResponse(e);
  }
}
