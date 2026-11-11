import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function clientReady(client: PrismaClient | undefined) {
  if (!client) return false;
  const accessGroup = (client as unknown as { accessGroup?: { findUnique?: unknown; upsert?: unknown } })
    .accessGroup;
  return (
    typeof accessGroup?.findUnique === "function" &&
    typeof accessGroup?.upsert === "function"
  );
}

/** Always resolve a current client — Next HMR can keep a pre-migration Prisma instance. */
export function getPrisma(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing && clientReady(existing)) return existing;
  if (existing) {
    void existing.$disconnect().catch(() => undefined);
  }
  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

/**
 * Live proxy so existing `import { prisma }` call sites never keep a stale client
 * after schema generate / migrate during `next dev`.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop as PropertyKey, receiver);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});

/** Interactive transactions need a sticky connection — use Neon direct (non-pooler) URL on Vercel. */
export function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts?: { maxWait?: number; timeout?: number }
) {
  return getPrisma().$transaction(fn, {
    maxWait: opts?.maxWait ?? 15_000,
    timeout: opts?.timeout ?? 60_000,
  });
}
