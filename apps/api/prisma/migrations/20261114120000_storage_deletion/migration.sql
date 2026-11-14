-- Security run-3: files whose attachment row is deleted (directly or by cascade from a movement,
-- an account or a user) are queued here by a trigger; the maintenance cron deletes the objects.

-- CreateTable
CREATE TABLE "storage-deletion" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage-deletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storage-deletion_createdAt_idx" ON "storage-deletion"("createdAt");

-- A UUID v7 (Principle VIII), for rows written by the database itself.
CREATE OR REPLACE FUNCTION "fik_uuid_v7"() RETURNS uuid AS $$
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

CREATE OR REPLACE FUNCTION "storage_deletion_enqueue"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "storage-deletion" ("id", "storageKey", "createdAt")
  VALUES ("fik_uuid_v7"()::text, OLD."storageKey", CURRENT_TIMESTAMP);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transaction-attachment_enqueue_storage_deletion"
AFTER DELETE ON "transaction-attachment"
FOR EACH ROW EXECUTE FUNCTION "storage_deletion_enqueue"();
