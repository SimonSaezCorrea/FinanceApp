import { describe, expect, it } from "vitest";

import { IdempotencyRecord } from "../../../../../src/domains/idempotency-record/domain/idempotency-record.aggregate";

const NOW = new Date("2026-09-02T12:00:00.000Z");

function makeRecord(
  overrides: Partial<Parameters<typeof IdempotencyRecord.fromPersistence>[0]> = {},
) {
  return IdempotencyRecord.fromPersistence({
    id: "ir1",
    userId: "u1",
    key: "b3f1c0de-0000-4000-8000-000000000001",
    operation: "transaction.create",
    requestHash: "hash-a",
    status: "IN_FLIGHT",
    responseBody: null,
    responseStatus: null,
    createdAt: NOW,
    expiresAt: new Date("2026-09-03T12:00:00.000Z"),
    ...overrides,
  });
}

describe("IdempotencyRecord.planReservation", () => {
  it("starts IN_FLIGHT and expires one retention window later", () => {
    const plan = IdempotencyRecord.planReservation({
      key: "b3f1c0de-0000-4000-8000-000000000001",
      operation: "transaction.create",
      requestHash: "hash-a",
      now: NOW,
    });

    expect(plan.status).toBe("IN_FLIGHT");
    expect(plan.responseBody).toBeNull();
    // 24h retention: long enough to cover any plausible client retry.
    expect(plan.expiresAt.toISOString()).toBe("2026-09-03T12:00:00.000Z");
  });
});

describe("IdempotencyRecord.complete", () => {
  it("records the response verbatim so a replay can return it unchanged", () => {
    const record = makeRecord();

    record.complete({ id: "t1", amount: "12000" }, 201);

    const snap = record.snapshot();
    expect(snap.status).toBe("COMPLETED");
    expect(snap.responseBody).toEqual({ id: "t1", amount: "12000" });
    expect(snap.responseStatus).toBe(201);
  });
});

describe("IdempotencyRecord.isStale", () => {
  // The whole safety argument: the effect and the COMPLETED mark commit in the
  // SAME transaction, so an IN_FLIGHT record means the effect did NOT commit —
  // unless its transaction is still running, which cannot outlast the window.
  it("is not stale while inside the in-flight window", () => {
    const record = makeRecord({ createdAt: new Date(NOW.getTime() - 59_000) });
    expect(record.isStale(NOW)).toBe(false);
  });

  it("is stale once the in-flight window has passed", () => {
    const record = makeRecord({ createdAt: new Date(NOW.getTime() - 61_000) });
    expect(record.isStale(NOW)).toBe(true);
  });

  it("is never stale once completed — a finished attempt is not abandoned", () => {
    const record = makeRecord({
      status: "COMPLETED",
      createdAt: new Date(NOW.getTime() - 10 * 60_000),
      responseBody: { id: "t1" },
      responseStatus: 201,
    });
    expect(record.isStale(NOW)).toBe(false);
  });
});

describe("IdempotencyRecord.matches", () => {
  it("matches when both the operation and the request hash are the same", () => {
    const record = makeRecord();
    expect(record.matches("transaction.create", "hash-a")).toBe(true);
  });

  it("does not match a different request hash — same key, different data", () => {
    const record = makeRecord();
    expect(record.matches("transaction.create", "hash-b")).toBe(false);
  });

  it("does not match a different operation — a key belongs to one operation", () => {
    const record = makeRecord();
    expect(record.matches("debt.settle", "hash-a")).toBe(false);
  });
});
