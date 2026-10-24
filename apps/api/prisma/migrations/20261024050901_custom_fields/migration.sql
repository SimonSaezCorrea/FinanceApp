-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('BOOLEAN', 'TEXT', 'NUMBER', 'DATE', 'OPTION');

-- CreateEnum
CREATE TYPE "CustomFieldMovementKind" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER');

-- CreateTable
CREATE TABLE "custom-field" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "scopeMovementKinds" "CustomFieldMovementKind"[],
    "scopeRestrictAccounts" BOOLEAN NOT NULL DEFAULT false,
    "scopeAccountIds" TEXT[],
    "scopeCardKinds" "CardKind"[],
    "defaultValue" JSONB,
    "showAsColumn" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom-field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction-field-value" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "booleanValue" BOOLEAN,
    "textValue" TEXT,
    "numberValue" DECIMAL(24,8),
    "dateValue" DATE,
    "optionId" TEXT,
    "coveredByTransferGroupId" TEXT,
    "coverPreviousValue" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction-field-value_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom-field_userId_sortOrder_idx" ON "custom-field"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "custom-field_userId_nameKey_key" ON "custom-field"("userId", "nameKey");

-- CreateIndex
CREATE INDEX "transaction-field-value_userId_idx" ON "transaction-field-value"("userId");

-- CreateIndex
CREATE INDEX "transaction-field-value_customFieldId_booleanValue_idx" ON "transaction-field-value"("customFieldId", "booleanValue");

-- CreateIndex
CREATE INDEX "transaction-field-value_customFieldId_optionId_idx" ON "transaction-field-value"("customFieldId", "optionId");

-- CreateIndex
CREATE INDEX "transaction-field-value_customFieldId_numberValue_idx" ON "transaction-field-value"("customFieldId", "numberValue");

-- CreateIndex
CREATE INDEX "transaction-field-value_customFieldId_dateValue_idx" ON "transaction-field-value"("customFieldId", "dateValue");

-- CreateIndex
CREATE INDEX "transaction-field-value_userId_coveredByTransferGroupId_idx" ON "transaction-field-value"("userId", "coveredByTransferGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction-field-value_transactionId_customFieldId_key" ON "transaction-field-value"("transactionId", "customFieldId");

-- AddForeignKey
ALTER TABLE "custom-field" ADD CONSTRAINT "custom-field_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction-field-value" ADD CONSTRAINT "transaction-field-value_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction-field-value" ADD CONSTRAINT "transaction-field-value_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction-field-value" ADD CONSTRAINT "transaction-field-value_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "custom-field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

