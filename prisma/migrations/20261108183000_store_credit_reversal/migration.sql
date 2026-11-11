-- AlterTable
ALTER TABLE "CustomerPayment" ADD COLUMN IF NOT EXISTS "isStoreCreditReversal" BOOLEAN NOT NULL DEFAULT false;
