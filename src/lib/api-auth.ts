import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { hasPermission, type Permission } from "./permissions";

export async function apiUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session.user;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function requireApiRoles(user: { role: Role }, roles: Role[]) {
  return roles.includes(user.role);
}

export function requireApiPermission(
  user: { permissions?: string[] | null; role?: Role } | null | undefined,
  permission: Permission
) {
  return hasPermission(user, permission);
}

export function forbidUnlessPermission(
  user: { permissions?: string[] | null; role?: Role } | null | undefined,
  permission: Permission
) {
  if (!user) return unauthorized();
  if (!hasPermission(user, permission)) return forbidden();
  return null;
}
