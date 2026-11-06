import { prisma } from "@/lib/prisma";

export const HELD_TTL_MS = 48 * 60 * 60 * 1000;
export const HELD_MAX_PER_BRANCH = 20;

export type HeldCartItem = {
  productId: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  priceOverridden?: boolean;
  maxQty: number;
  trackSerial?: boolean;
  serials: string[];
  imageUrl?: string | null;
};

export type HeldSalePayload = {
  id: string;
  label: string;
  cart: HeldCartItem[];
  discount: number;
  discountMode: "none" | "5" | "10" | "custom";
  promoCode: string;
  customerId: string;
  heldAt: number;
  expiresAt: string;
  cashierName: string;
};

type HeldRow = {
  id: string;
  label: string;
  cart: unknown;
  discount: number;
  discountMode: string;
  promoCode: string;
  customerId: string | null;
  createdAt: Date;
  expiresAt: Date;
  cashier: { name: string };
};

function asDiscountMode(v: string): HeldSalePayload["discountMode"] {
  if (v === "5" || v === "10" || v === "custom") return v;
  return "none";
}

export function serializeHeldSale(row: HeldRow): HeldSalePayload {
  return {
    id: row.id,
    label: row.label,
    cart: Array.isArray(row.cart) ? (row.cart as HeldCartItem[]) : [],
    discount: row.discount,
    discountMode: asDiscountMode(row.discountMode),
    promoCode: row.promoCode || "",
    customerId: row.customerId || "",
    heldAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.toISOString(),
    cashierName: row.cashier.name,
  };
}

export async function pruneExpiredHeldSales(branchId: string) {
  await prisma.heldSale.deleteMany({
    where: { branchId, expiresAt: { lt: new Date() } },
  });
}

export function heldExpiresAt(from = new Date()) {
  return new Date(from.getTime() + HELD_TTL_MS);
}
