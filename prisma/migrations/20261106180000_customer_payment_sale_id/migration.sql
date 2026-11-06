-- AlterTable
ALTER TABLE "CustomerPayment" ADD COLUMN IF NOT EXISTS "saleId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerPayment_saleId_idx" ON "CustomerPayment"("saleId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerPayment_saleId_fkey'
  ) THEN
    ALTER TABLE "CustomerPayment"
      ADD CONSTRAINT "CustomerPayment_saleId_fkey"
      FOREIGN KEY ("saleId") REFERENCES "Sale"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
