-- Security run-3 (expand only; the previous code ignores these columns).
-- Refresh-token rotation with reuse detection.
ALTER TABLE "session" ADD COLUMN "refreshJti" TEXT;
ALTER TABLE "session" ADD COLUMN "previousRefreshJti" TEXT;
ALTER TABLE "session" ADD COLUMN "refreshRotatedAt" TIMESTAMP(3);

-- A TOTP code can't be used twice.
ALTER TABLE "user" ADD COLUMN "mfaLastTotpStep" INTEGER;
