-- AlterTable
ALTER TABLE "CustomerPayment" ADD COLUMN "receiptNo" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayment_receiptNo_key" ON "CustomerPayment"("receiptNo");
