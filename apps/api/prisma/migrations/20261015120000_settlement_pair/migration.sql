-- AlterTable
ALTER TABLE "transaction" ADD COLUMN     "settlementPairId" TEXT;

-- CreateIndex
CREATE INDEX "transaction_settlementPairId_idx" ON "transaction"("settlementPairId");

-- Backfill: pair the prepayments in another currency made before this column existed. Each one
-- wrote, in one transaction, an EXPENSE on the source account (settlesStatementId +
-- prepaymentAccountId) and an INCOME settlement on the credit account (settlesStatementId), with
-- ids minted one after the other (UUID v7, time-ordered). A payment's settlement INCOME is
-- excluded: its statement points at it (`settlementTransactionId`). Within one statement the
-- k-th prepayment expense pairs with the k-th prepayment income, both ordered by id.
WITH expenses AS (
  SELECT t."id", t."settlesStatementId",
         ROW_NUMBER() OVER (PARTITION BY t."settlesStatementId" ORDER BY t."id") AS n
  FROM "transaction" t
  WHERE t."settlesStatementId" IS NOT NULL
    AND t."type" = 'EXPENSE'
    AND t."prepaymentAccountId" IS NOT NULL
),
incomes AS (
  SELECT t."id", t."settlesStatementId",
         ROW_NUMBER() OVER (PARTITION BY t."settlesStatementId" ORDER BY t."id") AS n
  FROM "transaction" t
  WHERE t."settlesStatementId" IS NOT NULL
    AND t."type" = 'INCOME'
    AND NOT EXISTS (
      SELECT 1 FROM "credit-statement" s WHERE s."settlementTransactionId" = t."id"
    )
),
pairs AS (
  SELECT e."id" AS expense_id, i."id" AS income_id
  FROM expenses e
  JOIN incomes i ON i."settlesStatementId" = e."settlesStatementId" AND i.n = e.n
)
UPDATE "transaction" t
SET "settlementPairId" = p.expense_id
FROM pairs p
WHERE t."id" IN (p.expense_id, p.income_id);
