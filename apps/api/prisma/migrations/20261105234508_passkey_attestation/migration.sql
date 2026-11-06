-- AlterTable
ALTER TABLE "passkey" ADD COLUMN     "aaguid" TEXT,
ADD COLUMN     "authenticatorName" TEXT,
ADD COLUMN     "compromisedAt" TIMESTAMP(3),
ADD COLUMN     "compromisedReason" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "passkeyId" TEXT;

-- CreateTable
CREATE TABLE "authenticator-model" (
    "id" TEXT NOT NULL,
    "aaguid" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "statement" JSONB NOT NULL,
    "compromisedStatus" TEXT,
    "statusDate" TIMESTAMP(3),
    "catalogNumber" INTEGER NOT NULL,
    "catalogNextUpdate" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authenticator-model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "authenticator-model_aaguid_key" ON "authenticator-model"("aaguid");

-- CreateIndex
CREATE INDEX "passkey_aaguid_idx" ON "passkey"("aaguid");

-- CreateIndex
CREATE INDEX "session_passkeyId_idx" ON "session"("passkeyId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_passkeyId_fkey" FOREIGN KEY ("passkeyId") REFERENCES "passkey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
