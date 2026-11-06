-- CreateTable
CREATE TABLE "HeldSale" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "customerId" TEXT,
    "label" TEXT NOT NULL,
    "cart" JSONB NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountMode" TEXT NOT NULL DEFAULT 'none',
    "promoCode" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeldSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HeldSale_branchId_expiresAt_idx" ON "HeldSale"("branchId", "expiresAt");

-- CreateIndex
CREATE INDEX "HeldSale_cashierId_idx" ON "HeldSale"("cashierId");

-- AddForeignKey
ALTER TABLE "HeldSale" ADD CONSTRAINT "HeldSale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeldSale" ADD CONSTRAINT "HeldSale_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeldSale" ADD CONSTRAINT "HeldSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
