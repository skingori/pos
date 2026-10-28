import { prisma } from "./prisma";

export async function writeAudit(opts: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
}) {
  await prisma.auditLog.create({
    data: {
      userId: opts.userId || null,
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId,
      detail: opts.detail,
    },
  });
}
