-- Novedades by version: the account keeps the newest VERSION it saw (`1.2`), no longer a record
-- id. Never deployed to production with the old meaning, so a plain rename; an old record id left
-- in a development database is cleared (it would read as nothing seen anyway).
ALTER TABLE "user" RENAME COLUMN "releaseNotesSeenId" TO "releaseNotesSeenVersion";
UPDATE "user" SET "releaseNotesSeenVersion" = NULL WHERE "releaseNotesSeenVersion" !~ '^[0-9]+\.[0-9]+$';
