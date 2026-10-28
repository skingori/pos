import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "1") {
    throw new Error(
      "Refusing to seed in production. Set ALLOW_SEED=1 only for first bootstrap."
    );
  }

  const mainBranch = await prisma.branch.upsert({
    where: { code: "BR0001" },
    update: { name: "Main", active: true, country: "Kenya" },
    create: {
      id: "branch_main",
      code: "BR0001",
      name: "Main",
      country: "Kenya",
      active: true,
    },
  });

  const users = [
    { name: "Admin", email: "admin@example.com", role: Role.ADMIN, password: "admin123" },
    { name: "Manager", email: "manager@example.com", role: Role.MANAGER, password: "manager123" },
    { name: "Cashier", email: "cashier@example.com", role: Role.ATTENDANT, password: "cashier123" },
    { name: "Admin", email: "admin@hardware.local", role: Role.ADMIN, password: "admin123" },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        passwordHash: await bcrypt.hash(u.password, 12),
        role: u.role,
        active: true,
        name: u.name,
        mustChangePassword: true,
        branchId: mainBranch.id,
      },
      create: {
        name: u.name,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 12),
        role: u.role,
        mustChangePassword: true,
        branchId: mainBranch.id,
      },
    });
  }

  const categories = ["Fasteners", "Pipes", "Paint", "Tools", "Cement & Aggregates"];
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const fasteners = await prisma.category.findUnique({ where: { name: "Fasteners" } });
  const tools = await prisma.category.findUnique({ where: { name: "Tools" } });
  const cement = await prisma.category.findUnique({ where: { name: "Cement & Aggregates" } });

  const products = [
    { name: "Nail 3 inch (1kg)", sku: "NL-300", barcode: "6001001001001", cost: 180, sellPrice: 250, qty: 40, reorderLevel: 10, unit: "kg", categoryId: fasteners?.id },
    { name: "Bolt M10 x 50mm", sku: "BT-M10", barcode: "6001001001002", cost: 15, sellPrice: 25, qty: 200, reorderLevel: 50, unit: "pc", categoryId: fasteners?.id },
    { name: "Hammer 16oz", sku: "HM-16", barcode: "6001001001003", cost: 450, sellPrice: 750, qty: 12, reorderLevel: 5, unit: "pc", categoryId: tools?.id },
    { name: "Screwdriver Set", sku: "SD-SET", barcode: "6001001001004", cost: 600, sellPrice: 950, qty: 8, reorderLevel: 3, unit: "set", categoryId: tools?.id },
    { name: "Bamburi Cement 50kg", sku: "CM-50", barcode: "6001001001005", cost: 780, sellPrice: 920, qty: 60, reorderLevel: 20, unit: "bag", categoryId: cement?.id },
    { name: "PVC Pipe 1 inch (6m)", sku: "PV-1", barcode: "6001001001006", cost: 350, sellPrice: 480, qty: 25, reorderLevel: 8, unit: "pc", categoryId: null },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        trackSerial: p.sku === "HM-16",
      },
      create: {
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        cost: p.cost,
        sellPrice: p.sellPrice,
        unit: p.unit,
        categoryId: p.categoryId ?? undefined,
        trackSerial: p.sku === "HM-16",
      },
    });
    await prisma.branchStock.upsert({
      where: {
        branchId_productId: { branchId: mainBranch.id, productId: product.id },
      },
      update: {
        qty: p.qty,
        reorderLevel: p.reorderLevel,
      },
      create: {
        branchId: mainBranch.id,
        productId: product.id,
        qty: p.qty,
        reorderLevel: p.reorderLevel,
      },
    });
  }

  const chart = [
    { code: "1000", name: "Cash on hand", type: "ASSET" as const },
    { code: "1010", name: "M-Pesa", type: "ASSET" as const },
    { code: "1100", name: "Accounts receivable", type: "ASSET" as const },
    { code: "1200", name: "Inventory", type: "ASSET" as const },
    { code: "2100", name: "VAT payable", type: "LIABILITY" as const },
    { code: "3000", name: "Owner equity / cash float", type: "EQUITY" as const },
    { code: "4000", name: "Sales revenue", type: "INCOME" as const },
    { code: "5000", name: "Cost of goods sold", type: "COGS" as const },
    { code: "5200", name: "Sales returns", type: "EXPENSE" as const },
    { code: "5300", name: "Inventory write-off", type: "EXPENSE" as const },
  ];
  for (const a of chart) {
    await prisma.account.upsert({
      where: { code: a.code },
      update: { name: a.name, type: a.type },
      create: a,
    });
  }

  await prisma.customer.upsert({
    where: { id: "seed-customer-1" },
    update: {},
    create: {
      id: "seed-customer-1",
      name: "Wanjiku Contractors",
      phone: "0712345678",
      creditLimit: 50000,
      balance: 0,
    },
  });

  await prisma.supplier.upsert({
    where: { id: "seed-supplier-1" },
    update: {},
    create: {
      id: "seed-supplier-1",
      name: "Nairobi Hardware Wholesalers",
      phone: "0722000000",
    },
  });

  await prisma.shopSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      shopName: "Kenya Hardware",
      defaultMarkupPercent: 25,
      vatPercent: 16,
      pricesIncludeVat: true,
      currency: "KES",
      receiptFooter: "Thank you for shopping with us!",
    },
  });

  await prisma.priceLevel.upsert({
    where: { name: "Retail" },
    update: {},
    create: { name: "Retail", discountPercent: 0 },
  });
  await prisma.priceLevel.upsert({
    where: { name: "Wholesale" },
    update: {},
    create: { name: "Wholesale", discountPercent: 10 },
  });

  console.log("Seed complete. admin@example.com / admin123 · Main branch BR0001");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
