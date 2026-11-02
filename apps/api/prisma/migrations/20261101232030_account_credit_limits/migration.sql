-- CreateTable
CREATE TABLE "account-credit-limit" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "limitAmount" DECIMAL(18,4) NOT NULL,
    "usedInitial" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account-credit-limit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account-credit-limit_accountId_currency_key" ON "account-credit-limit"("accountId", "currency");

-- AddForeignKey
ALTER TABLE "account-credit-limit" ADD CONSTRAINT "account-credit-limit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank-account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Spec 039: the account's credit in other currencies moves off the primary card. Until now a
-- CardLimit in another currency was an independent pool on its card (the primary's held the
-- account's USD credit; an additional's was its own). Their sum is the new account credit in
-- that currency, so no card can spend less than before; additional cards keep theirs as
-- sub-limits within it. The primary's rows stay in place (the previous code still reads them
-- during the deploy) and are ignored by the new code; a later migration deletes them.
-- backfill:start
-- Row ids are UUID v7 (Constitution VIII), same generator as 20261011021405_account_emails, under
-- its own name so both can run in one session (the shadow database applies them together).
CREATE OR REPLACE FUNCTION pg_temp.credit_limit_uuid_v7() RETURNS uuid AS $$
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

INSERT INTO "account-credit-limit" ("id", "accountId", "currency", "limitAmount", "usedInitial", "updatedAt")
SELECT pg_temp.credit_limit_uuid_v7()::text, c."accountId", l."currency", SUM(l."limitAmount"), SUM(l."usedInitial"), CURRENT_TIMESTAMP
FROM "card-limit" l
JOIN "card-account" c ON c."id" = l."cardId"
JOIN "bank-account" a ON a."id" = c."accountId"
WHERE c."kind" = 'CREDIT' AND l."currency" <> a."currency"
GROUP BY c."accountId", l."currency"
ON CONFLICT ("accountId", "currency") DO NOTHING;
-- backfill:end

-- At most one primary card per account; the domain keeps exactly one, and active (spec 039).
CREATE UNIQUE INDEX "card-account_one_primary_per_account" ON "card-account"("accountId") WHERE "isPrimary";
