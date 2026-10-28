import { prisma } from "./prisma";

export async function getShopSettings() {
  return prisma.shopSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      shopName: process.env.SHOP_NAME || "Kenya Hardware",
      defaultMarkupPercent: 25,
      vatPercent: 16,
      pricesIncludeVat: true,
      currency: "KES",
      receiptFooter: "Thank you for your business!",
    },
  });
}
