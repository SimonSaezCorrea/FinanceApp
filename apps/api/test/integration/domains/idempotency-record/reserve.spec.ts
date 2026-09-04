import { ConfigService } from "@nestjs/config";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { IdempotencyRecord } from "../../../../src/domains/idempotency-record/domain/idempotency-record.aggregate";
import { PrismaIdempotencyRecordRepository } from "../../../../src/domains/idempotency-record/infrastructure/prisma-idempotency-record.repository";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/**
 * The mutual exclusion behind FR-006, proven against a real Postgres.
 *
 * This CANNOT be demonstrated with fake ports: the guarantee is the
 * `@@unique([userId, key])` constraint, and an in-memory map that checks before
 * inserting has a window the database does not. Simulating it would prove the
 * simulation, not the lock.
 */
describe("PrismaIdempotencyRecordRepository — the unique constraint IS the lock (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaIdempotencyRecordRepository(prisma);
  let userId: string;

  const plan = (key: string, hash = "hash-a") =>
    IdempotencyRecord.planReservation({
      key,
      operation: "transaction.create",
      requestHash: hash,
      now: new Date(),
    });

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email: `idem-${Date.now()}@test.local`, name: "Idempotency test" },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.idempotencyRecord.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("reserves a fresh key", async () => {
    const result = await repo.reserve(userId, plan("key-fresh-0000000000"));
    expect(result.kind).toBe("RESERVED");
  });

  it("reports EXISTS on a second reservation of the same key", async () => {
    const key = "key-twice-0000000000";
    await repo.reserve(userId, plan(key));
    const second = await repo.reserve(userId, plan(key));

    expect(second.kind).toBe("EXISTS");
    expect(second.record.snapshot().key).toBe(key);
  });

  it("lets exactly ONE of many simultaneous reservations win", async () => {
    const key = "key-race-00000000000";

    // Fired together, not in sequence: this is the case the constraint exists for.
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repo.reserve(userId, plan(key))),
    );

    expect(results.filter((r) => r.kind === "RESERVED")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "EXISTS")).toHaveLength(7);
    expect(await prisma.idempotencyRecord.count({ where: { userId, key } })).toBe(1);
  });

  it("scopes keys per user — the same key from another account is a fresh attempt", async () => {
    const other = await prisma.user.create({
      data: { email: `idem-other-${Date.now()}@test.local`, name: "Other" },
    });
    const key = "key-scoped-000000000";

    await repo.reserve(userId, plan(key));
    const otherResult = await repo.reserve(other.id, plan(key));

    expect(otherResult.kind).toBe("RESERVED");

    await prisma.idempotencyRecord.deleteMany({ where: { userId: other.id } });
    await prisma.user.delete({ where: { id: other.id } });
  });

  it("frees the key again after release, so a rejected attempt can be retried", async () => {
    const key = "key-release-00000000";
    const first = await repo.reserve(userId, plan(key));
    await repo.release(first.record.id);

    expect((await repo.reserve(userId, plan(key))).kind).toBe("RESERVED");
  });

  it("deleteExpired drops only what is past its window", async () => {
    const past = new Date(Date.now() - 1000);
    await prisma.idempotencyRecord.create({
      data: {
        userId,
        key: "key-expired-0000000",
        operation: "transaction.create",
        requestHash: "h",
        expiresAt: past,
      },
    });
    await repo.reserve(userId, plan("key-live-0000000000"));

    const deleted = await repo.deleteExpired(new Date());

    expect(deleted).toBe(1);
    expect(await prisma.idempotencyRecord.count({ where: { userId } })).toBe(1);
  });
});
