-- AlterTable
ALTER TABLE "user" ADD COLUMN     "mfaPendingAt" TIMESTAMP(3),
ADD COLUMN     "mfaPendingSessionId" TEXT;
