-- AlterTable
ALTER TABLE "CustomerPayment" ADD COLUMN "isWriteOff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerPayment" ADD COLUMN "userId" TEXT;

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
