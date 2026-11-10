-- A statement paid in its account's own currency now also writes a settlement INCOME on the credit
-- account (`settlesStatementId`, no period, no card), so the payment shows there and not only on
-- the source account. This backfills it for the payments made before: one INCOME per paid
-- account-currency statement that still has its payment movement and no settlement yet.
-- Data only; the row is excluded from period sums and pool tallies exactly like the foreign one,
-- so balances, `creditUsed` and statement amounts do not move. The previous code deletes it with
-- the payment on "Deshacer pago" (it already deletes `settlementTransactionId`), so it is safe
-- during the deploy.

-- Row ids are UUID v7 (Constitution VIII), same generator as 20261101232030_account_credit_limits,
-- under its own name so both can run in one session (the shadow database applies them together).
CREATE OR REPLACE FUNCTION pg_temp.statement_settlement_uuid_v7() RETURNS uuid AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
          PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6),
        52, 1),
      53, 1),
    'hex')::uuid
$$ LANGUAGE sql VOLATILE;

WITH src AS MATERIALIZED (
  SELECT
    s."id" AS "statementId",
    pg_temp.statement_settlement_uuid_v7()::text AS "settlementId",
    a."userId",
    a."id" AS "accountId",
    a."currency",
    s."paidAmount",
    p."occurredAt",
    p."categoryId",
    COALESCE(f."name", p."description") AS "description",
    p."observation"
  FROM "credit-statement" s
  JOIN "bank-account" a ON a."id" = s."accountId"
  JOIN "transaction" p ON p."id" = s."paidTransactionId"
  LEFT JOIN "bank-account" f ON f."id" = s."paidFromAccountId"
  WHERE s."paidAt" IS NOT NULL
    AND s."settlementTransactionId" IS NULL
    AND s."currency" = a."currency"
    AND s."paidAmount" > 0
),
inserted AS (
  INSERT INTO "transaction" (
    "id", "userId", "bankAccountId", "type", "amount", "currency", "occurredAt",
    "categoryId", "description", "observation", "settlesStatementId", "updatedAt"
  )
  SELECT
    "settlementId", "userId", "accountId", 'INCOME', "paidAmount", "currency", "occurredAt",
    "categoryId", "description", "observation", "statementId", CURRENT_TIMESTAMP
  FROM src
  RETURNING "id"
)
UPDATE "credit-statement" s
SET "settlementTransactionId" = src."settlementId"
FROM src
WHERE s."id" = src."statementId";
