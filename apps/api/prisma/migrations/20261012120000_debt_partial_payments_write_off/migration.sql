-- AlterTable
ALTER TABLE "debt" ADD COLUMN     "paidAmount" DECIMAL(18,4),
ADD COLUMN     "writtenOffAt" TIMESTAMP(3);
