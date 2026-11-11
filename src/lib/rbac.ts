import { Prisma, PrismaClient, Role } from "@prisma/client";
import { getPrisma } from "./prisma";
import {
  normalizePermissions,
  ROLE_DEFAULT_PERMISSIONS,
} from "./permissions";

type Tx = Prisma.TransactionClient | PrismaClient;

function dbOrPrisma(db?: Tx): Tx {
  return db ?? getPrisma();
}

export const SYSTEM_GROUP_CODES = ["ADMIN", "MANAGER", "ATTENDANT"] as const;

export function roleFromGroupCode(code: string): Role {
  if (code === "ADMIN") return Role.ADMIN;
  if (code === "MANAGER") return Role.MANAGER;
  return Role.ATTENDANT;
}

export async function seedRolePermissionTemplates(db?: Tx) {
  const client = dbOrPrisma(db);
  for (const role of Object.values(Role)) {
    const defaults = ROLE_DEFAULT_PERMISSIONS[role];
    for (const permission of defaults) {
      await client.rolePermission.upsert({
        where: { role_permission: { role, permission } },
        update: {},
        create: { role, permission },
      });
    }
  }
}

export async function ensureSystemAccessGroups(db?: Tx) {
  const client = dbOrPrisma(db);
  if (typeof (client as PrismaClient).accessGroup?.upsert !== "function") {
    throw new Error(
      "Prisma client is missing AccessGroup. Stop the app, run `npx prisma generate`, then start again."
    );
  }
  await seedRolePermissionTemplates(client);
  const specs: { code: string; name: string; description: string; role: Role }[] = [
    {
      code: "ADMIN",
      name: "Admin",
      description: "Full system access",
      role: Role.ADMIN,
    },
    {
      code: "MANAGER",
      name: "Manager",
      description: "Store operations, stock, reports",
      role: Role.MANAGER,
    },
    {
      code: "ATTENDANT",
      name: "Attendant",
      description: "POS, cash, and customer ops",
      role: Role.ATTENDANT,
    },
  ];

  for (const spec of specs) {
    const group = await client.accessGroup.upsert({
      where: { code: spec.code },
      update: { name: spec.name, description: spec.description, isSystem: true },
      create: {
        code: spec.code,
        name: spec.name,
        description: spec.description,
        isSystem: true,
      },
    });
    const existing = await client.accessGroupPermission.count({
      where: { groupId: group.id },
    });
    if (existing > 0) continue;
    const perms = await getRoleTemplatePermissions(spec.role, client);
    await setGroupPermissions(group.id, perms, client);
  }
}

export async function getRoleTemplatePermissions(role: Role, db?: Tx) {
  const client = dbOrPrisma(db);
  const rows = await client.rolePermission.findMany({
    where: { role },
    select: { permission: true },
  });
  const fromDb = normalizePermissions(rows.map((r) => r.permission));
  if (fromDb.length) return fromDb;
  return [...ROLE_DEFAULT_PERMISSIONS[role]];
}

/** Full replace that tolerates concurrent writers (ON CONFLICT DO NOTHING). */
async function replaceUniquePermissions<T extends object>(
  delegate: {
    deleteMany: (args: { where: object }) => Promise<unknown>;
    createMany: (args: { data: T[]; skipDuplicates?: boolean }) => Promise<unknown>;
  },
  where: object,
  rows: T[]
) {
  await delegate.deleteMany({ where });
  if (!rows.length) return;
  await delegate.createMany({ data: rows, skipDuplicates: true });
}

export async function getGroupPermissions(groupId: string, db?: Tx) {
  const client = dbOrPrisma(db);
  const rows = await client.accessGroupPermission.findMany({
    where: { groupId },
    select: { permission: true },
  });
  return normalizePermissions(rows.map((r) => r.permission));
}

export async function setGroupPermissions(
  groupId: string,
  permissions: string[],
  db?: Tx
) {
  const client = dbOrPrisma(db);
  const group = await client.accessGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new Error("Group not found");
  const next =
    group.code === "ADMIN"
      ? [...ROLE_DEFAULT_PERMISSIONS.ADMIN]
      : normalizePermissions(permissions);

  await replaceUniquePermissions(
    client.accessGroupPermission,
    { groupId },
    next.map((permission) => ({ groupId, permission }))
  );

  if (
    group.isSystem &&
    SYSTEM_GROUP_CODES.includes(group.code as (typeof SYSTEM_GROUP_CODES)[number])
  ) {
    await setRoleTemplatePermissions(roleFromGroupCode(group.code), next, client);
  }
  return next;
}

export async function getUserPermissions(userId: string, db?: Tx) {
  const client = dbOrPrisma(db);
  const rows = await client.userPermission.findMany({
    where: { userId },
    select: { permission: true },
  });
  return normalizePermissions(rows.map((r) => r.permission));
}

export async function setUserPermissions(
  userId: string,
  permissions: string[],
  db?: Tx
) {
  const client = dbOrPrisma(db);
  const next = normalizePermissions(permissions);
  await replaceUniquePermissions(
    client.userPermission,
    { userId },
    next.map((permission) => ({ userId, permission }))
  );
  return next;
}

export async function setRoleTemplatePermissions(
  role: Role,
  permissions: string[],
  db?: Tx
) {
  const client = dbOrPrisma(db);
  const next =
    role === Role.ADMIN
      ? [...ROLE_DEFAULT_PERMISSIONS.ADMIN]
      : normalizePermissions(permissions);
  await replaceUniquePermissions(
    client.rolePermission,
    { role },
    next.map((permission) => ({ role, permission }))
  );
  return next;
}

export async function backfillUserPermissionsFromRoles(db?: Tx) {
  const client = dbOrPrisma(db);
  await ensureSystemAccessGroups(client);
  const users = await client.user.findMany({
    select: {
      id: true,
      role: true,
      groupId: true,
      permissions: { select: { id: true } },
    },
  });
  for (const user of users) {
    if (!user.groupId) {
      const code =
        user.role === Role.ADMIN
          ? "ADMIN"
          : user.role === Role.MANAGER
            ? "MANAGER"
            : "ATTENDANT";
      const group = await client.accessGroup.findUnique({ where: { code } });
      if (group) {
        await client.user.update({
          where: { id: user.id },
          data: { groupId: group.id },
        });
      }
    }
    if (user.permissions.length) continue;
    const template = await getRoleTemplatePermissions(user.role, client);
    await setUserPermissions(user.id, template, client);
  }
}

export async function ensureUserHasPermissions(
  userId: string,
  role: Role,
  db?: Tx
): Promise<Permission[]> {
  const client = dbOrPrisma(db);
  const existing = await getUserPermissions(userId, client);
  if (existing.length) return existing;
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { groupId: true },
  });
  if (user?.groupId) {
    const fromGroup = await getGroupPermissions(user.groupId, client);
    if (fromGroup.length) return setUserPermissions(userId, fromGroup, client);
  }
  const template = await getRoleTemplatePermissions(role, client);
  return setUserPermissions(userId, template, client);
}

export function slugifyGroupCode(name: string) {
  return (
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "GROUP"
  );
}
