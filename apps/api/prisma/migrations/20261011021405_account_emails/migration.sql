-- CreateEnum
CREATE TYPE "UserEmailStatus" AS ENUM ('PRIMARY', 'PENDING', 'PAST');

-- CreateEnum
CREATE TYPE "EmailTokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateTable
CREATE TABLE "user-email" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "UserEmailStatus" NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacedAt" TIMESTAMP(3),

    CONSTRAINT "user-email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email-token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "EmailTokenPurpose" NOT NULL,
    "userEmailId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email-token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user-email_userId_idx" ON "user-email"("userId");

-- CreateIndex
CREATE INDEX "user-email_address_idx" ON "user-email"("address");

-- CreateIndex
CREATE UNIQUE INDEX "email-token_tokenHash_key" ON "email-token"("tokenHash");

-- CreateIndex
CREATE INDEX "email-token_userId_purpose_createdAt_idx" ON "email-token"("userId", "purpose", "createdAt");

-- AddForeignKey
ALTER TABLE "user-email" ADD CONSTRAINT "user-email_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email-token" ADD CONSTRAINT "email-token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email-token" ADD CONSTRAINT "email-token_userEmailId_fkey" FOREIGN KEY ("userEmailId") REFERENCES "user-email"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Written by hand (specs/032): rules Prisma cannot express ----

-- Exactly one PRIMARY and at most one PENDING address per account.
CREATE UNIQUE INDEX "user-email_one_primary_per_user" ON "user-email"("userId") WHERE "status" = 'PRIMARY';
CREATE UNIQUE INDEX "user-email_one_pending_per_user" ON "user-email"("userId") WHERE "status" = 'PENDING';

-- At most one unused link per (account, purpose): issuing a new one replaces the previous inside
-- one transaction, and two concurrent requests collide here instead of both leaving a valid link
-- (Constitution VII, form b).
CREATE UNIQUE INDEX "email-token_one_active_per_user_purpose" ON "email-token"("userId", "purpose") WHERE "usedAt" IS NULL;

-- Existing accounts: their current email becomes their PRIMARY address, unconfirmed (FR-013).
-- Row ids must be UUID v7 like every other table (Constitution VIII); Postgres 16 has no native
-- generator, so this session-only function stamps the millisecond timestamp over a random v4 and
-- flips its version nibble from 4 to 7 (the variant bits are already RFC 9562's).
CREATE FUNCTION pg_temp.uuid_v7() RETURNS uuid AS $$
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

INSERT INTO "user-email" ("id", "userId", "address", "status", "verifiedAt", "createdAt")
SELECT pg_temp.uuid_v7()::text, u."id", lower(trim(u."email")), 'PRIMARY', NULL, CURRENT_TIMESTAMP
FROM "user" u
WHERE u."email" IS NOT NULL;

UPDATE "user" SET "emailVerified" = NULL WHERE "emailVerified" IS NOT NULL;
