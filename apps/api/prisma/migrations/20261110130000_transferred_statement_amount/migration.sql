-- A statement transferred to the account's currency (spec 028 US3) never had its total written:
-- the adapter froze `amount` only for a paid period, so a transferred one read "0" and "Deshacer
-- traspaso" promised "0" back. Its total is what it had paid (normally 0) plus what the transfer
-- settled — the settlement INCOME's own amount. Data only.
UPDATE "credit-statement" s
SET "amount" = s."paidAmount" + t."amount"
FROM "transaction" t
WHERE t."id" = s."settlementTransactionId"
  AND s."transferredAt" IS NOT NULL
  AND s."amount" IS NULL;
