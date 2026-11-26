-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "groupId" UUID,
ADD COLUMN     "guestName" TEXT;

-- CreateIndex
CREATE INDEX "appointments_groupId_idx" ON "appointments"("groupId");
