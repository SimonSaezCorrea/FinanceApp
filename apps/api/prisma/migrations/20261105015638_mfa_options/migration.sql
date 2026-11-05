-- CreateEnum
CREATE TYPE "MfaMethod" AS ENUM ('TOTP', 'EMAIL');

-- CreateEnum
CREATE TYPE "MfaCodePurpose" AS ENUM ('LOGIN', 'ENROLL', 'STEP_UP');

-- CreateEnum
CREATE TYPE "MfaCodeChannel" AS ENUM ('EMAIL');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "mfaMethod" "MfaMethod",
ADD COLUMN     "mfaPendingMethod" "MfaMethod";

-- CreateTable
CREATE TABLE "trusted-device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "trusted-device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa-code" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "MfaCodePurpose" NOT NULL,
    "channel" "MfaCodeChannel" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa-code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trusted-device_tokenHash_key" ON "trusted-device"("tokenHash");

-- CreateIndex
CREATE INDEX "trusted-device_userId_createdAt_idx" ON "trusted-device"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "mfa-code_userId_purpose_createdAt_idx" ON "mfa-code"("userId", "purpose", "createdAt");

-- AddForeignKey
ALTER TABLE "trusted-device" ADD CONSTRAINT "trusted-device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa-code" ADD CONSTRAINT "mfa-code_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Accounts that already had MFA used the authenticator app (the only method before specs/040).
UPDATE "user" SET "mfaMethod" = 'TOTP' WHERE "mfaEnabled" = true;

-- One active code per (user, purpose): issuing a new one marks the previous used, and a concurrent
-- issue collides here (Constitution VII, form b). Not expressible in schema.prisma; kept by hand.
CREATE UNIQUE INDEX "mfa-code_one_active_per_purpose" ON "mfa-code"("userId", "purpose") WHERE "usedAt" IS NULL;
