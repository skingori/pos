-- Ensure every drawer session is tied to a branch
UPDATE "PosSession" SET "branchId" = 'branch_main' WHERE "branchId" IS NULL;

ALTER TABLE "PosSession" DROP CONSTRAINT IF EXISTS "PosSession_branchId_fkey";
ALTER TABLE "PosSession" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
