import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { hasPermission, PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from "@/lib/permissions";
import {
  getRoleTemplatePermissions,
  seedRolePermissionTemplates,
  setRoleTemplatePermissions,
} from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { zodErrorResponse } from "@/lib/api";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "users.manage") && !hasPermission(user, "roles.manage")) {
    return forbidden();
  }

  await seedRolePermissionTemplates();
  const templates: Record<Role, string[]> = {
    ADMIN: [],
    MANAGER: [],
    ATTENDANT: [],
  };
  for (const role of Object.values(Role)) {
    templates[role] = await getRoleTemplatePermissions(role);
  }
  return NextResponse.json({
    permissions: PERMISSIONS,
    defaults: ROLE_DEFAULT_PERMISSIONS,
    templates,
  });
}

export async function PUT(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "roles.manage")) return forbidden();

  try {
    const body = z
      .object({
        role: z.nativeEnum(Role),
        permissions: z.array(z.string()),
      })
      .parse(await req.json());

    const saved = await setRoleTemplatePermissions(body.role, body.permissions);
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "RolePermission",
      entityId: body.role,
      detail: `${saved.length} permissions`,
    });
    return NextResponse.json({ role: body.role, permissions: saved });
  } catch (e) {
    return zodErrorResponse(e);
  }
}
