import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Reuse across hot serverless invocations (Vercel) and local HMR.
globalForPrisma.prisma = prisma;

/** Interactive transactions need a sticky connection — use Neon direct (non-pooler) URL on Vercel. */
export function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts?: { maxWait?: number; timeout?: number }
) {
  return prisma.$transaction(fn, {
    maxWait: opts?.maxWait ?? 15_000,
    timeout: opts?.timeout ?? 60_000,
  });
}
