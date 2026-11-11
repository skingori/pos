import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { hasPermission } from "./permissions";

export const BRANCH_COOKIE = "sf_branch";
export const MAIN_BRANCH_CODE = "BR0001";

export async function ensureMainBranch() {
  return prisma.branch.upsert({
    where: { code: MAIN_BRANCH_CODE },
    update: {},
    create: {
      id: "branch_main",
      code: MAIN_BRANCH_CODE,
      name: "Main",
      country: "Kenya",
      active: true,
    },
  });
}

export async function getBranchById(id: string) {
  return prisma.branch.findUnique({ where: { id } });
}

type ResolveUser = {
  id: string;
  role: Role;
  branchId?: string | null;
  permissions?: string[] | null;
};

export async function resolveBranchId(user: ResolveUser): Promise<string> {
  const open = await prisma.posSession.findFirst({
    where: {
      status: "OPEN",
      OR: [{ openedById: user.id }, ...(user.branchId ? [{ branchId: user.branchId }] : [])],
    },
    orderBy: { createdAt: "desc" },
  });
  if (open?.branchId) return open.branchId;

  if (canSwitchBranch(user)) {
    const jar = await cookies();
    const fromCookie = jar.get(BRANCH_COOKIE)?.value;
    if (fromCookie) {
      const b = await prisma.branch.findFirst({
        where: { id: fromCookie, active: true },
      });
      if (b) return b.id;
    }
  }

  if (user.branchId) {
    const home = await prisma.branch.findFirst({
      where: { id: user.branchId, active: true },
    });
    if (home) return home.id;
  }

  const main = await ensureMainBranch();
  return main.id;
}

export async function resolveBranch(user: ResolveUser) {
  const id = await resolveBranchId(user);
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id } });
  return branch;
}

export function canSwitchBranch(user: { role: Role; permissions?: string[] | null } | Role) {
  if (typeof user === "string") {
    return user === Role.ADMIN || user === Role.MANAGER;
  }
  return (
    user.role === Role.ADMIN ||
    user.role === Role.MANAGER ||
    hasPermission(user, "branches.manage")
  );
}
