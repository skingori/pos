-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- Seed Main branch
INSERT INTO "Branch" ("id", "code", "name", "country", "active", "createdAt", "updatedAt")
VALUES ('branch_main', 'BR0001', 'Main', 'Kenya', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateTable BranchStock
CREATE TABLE "BranchStock" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorderLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "BranchStock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchStock_branchId_productId_key" ON "BranchStock"("branchId", "productId");
CREATE INDEX "BranchStock_productId_idx" ON "BranchStock"("productId");

-- Copy product stock to Main
INSERT INTO "BranchStock" ("id", "branchId", "productId", "qty", "openedQty", "reorderLevel")
SELECT 'bstock_' || "id", 'branch_main', "id", "qty", "openedQty", "reorderLevel"
FROM "Product";

ALTER TABLE "BranchStock" ADD CONSTRAINT "BranchStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchStock" ADD CONSTRAINT "BranchStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- User.branchId
ALTER TABLE "User" ADD COLUMN "branchId" TEXT;
UPDATE "User" SET "branchId" = 'branch_main';
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PosSession.branchId
ALTER TABLE "PosSession" ADD COLUMN "branchId" TEXT;
UPDATE "PosSession" SET "branchId" = 'branch_main';
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "PosSession_branchId_status_idx" ON "PosSession"("branchId", "status");

-- Sale.branchId
ALTER TABLE "Sale" ADD COLUMN "branchId" TEXT;
UPDATE "Sale" SET "branchId" = 'branch_main';
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Sale_branchId_idx" ON "Sale"("branchId");

-- Purchase.branchId
ALTER TABLE "Purchase" ADD COLUMN "branchId" TEXT;
UPDATE "Purchase" SET "branchId" = 'branch_main';
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SerialUnit.branchId
ALTER TABLE "SerialUnit" ADD COLUMN "branchId" TEXT;
UPDATE "SerialUnit" SET "branchId" = 'branch_main' WHERE "status" = 'IN_STOCK';
ALTER TABLE "SerialUnit" ADD CONSTRAINT "SerialUnit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SerialUnit_branchId_idx" ON "SerialUnit"("branchId");

-- Drop stock columns from Product
ALTER TABLE "Product" DROP COLUMN "qty";
ALTER TABLE "Product" DROP COLUMN "openedQty";
ALTER TABLE "Product" DROP COLUMN "reorderLevel";
