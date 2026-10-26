-- CreateTable
CREATE TABLE "movement-template" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(18,4),
    "currency" TEXT,
    "bankAccountId" TEXT,
    "cardId" TEXT,
    "categoryId" TEXT,
    "recurringExpenseId" TEXT,
    "description" TEXT,
    "observation" TEXT,
    "emisor" TEXT,
    "receptor" TEXT,
    "lugar" TEXT,
    "financeCharge" BOOLEAN NOT NULL DEFAULT false,
    "customFieldValues" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movement-template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movement-template_bankAccountId_idx" ON "movement-template"("bankAccountId");

-- CreateIndex
CREATE INDEX "movement-template_cardId_idx" ON "movement-template"("cardId");

-- CreateIndex
CREATE INDEX "movement-template_categoryId_idx" ON "movement-template"("categoryId");

-- CreateIndex
CREATE INDEX "movement-template_recurringExpenseId_idx" ON "movement-template"("recurringExpenseId");

-- CreateIndex
CREATE UNIQUE INDEX "movement-template_userId_nameKey_key" ON "movement-template"("userId", "nameKey");

-- AddForeignKey
ALTER TABLE "movement-template" ADD CONSTRAINT "movement-template_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movement-template" ADD CONSTRAINT "movement-template_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank-account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movement-template" ADD CONSTRAINT "movement-template_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "card-account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movement-template" ADD CONSTRAINT "movement-template_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movement-template" ADD CONSTRAINT "movement-template_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "recurring-expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

