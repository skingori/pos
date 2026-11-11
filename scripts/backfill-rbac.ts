import { PrismaClient } from "@prisma/client";
import {
  backfillUserPermissionsFromRoles,
  ensureSystemAccessGroups,
} from "../src/lib/rbac";

const prisma = new PrismaClient();

async function main() {
  await ensureSystemAccessGroups(prisma);
  await backfillUserPermissionsFromRoles(prisma);
  const groups = await prisma.accessGroup.findMany({
    select: { code: true, _count: { select: { permissions: true, users: true } } },
  });
  const userCount = await prisma.userPermission.groupBy({ by: ["userId"], _count: true });
  console.log("RBAC backfill done", { groups, usersWithPerms: userCount.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
