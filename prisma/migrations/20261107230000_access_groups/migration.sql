-- CreateTable
CREATE TABLE "AccessGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGroupPermission" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessGroupPermission_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AccessGroup_code_key" ON "AccessGroup"("code");

-- CreateIndex
CREATE INDEX "AccessGroupPermission_groupId_idx" ON "AccessGroupPermission"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGroupPermission_groupId_permission_key" ON "AccessGroupPermission"("groupId", "permission");

-- CreateIndex
CREATE INDEX "User_groupId_idx" ON "User"("groupId");

-- AddForeignKey
ALTER TABLE "AccessGroupPermission" ADD CONSTRAINT "AccessGroupPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccessGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccessGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
