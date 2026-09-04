import { describe, expect, it } from "vitest";

import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
} from "../../../../../src/domains/idempotency-record/domain/errors";
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

/**
 * The four outcomes of colliding with an existing reservation
 * (specs/015-idempotent-money-writes/research.md §3). This is the decision the
 * whole feature turns on, so it lives in the aggregate and is tested directly.
 */
describe("IdempotencyRecord.decideReplay", () => {
  it("REPLAYS a completed attempt with the same operation and data (FR-003)", () => {
    const record = makeRecord({
      status: "COMPLETED",
      responseBody: { id: "t1", amount: "12000" },
      responseStatus: 201,
    });

    const decision = record.decideReplay("transaction.create", "hash-a", NOW);

    expect(decision).toEqual({
      kind: "REPLAY",
      body: { id: "t1", amount: "12000" },
      status: 201,
    });
  });

  it("rejects the same key carrying different data (FR-005)", () => {
    const record = makeRecord({
      status: "COMPLETED",
      responseBody: { id: "t1" },
      responseStatus: 201,
    });

    expect(() => record.decideReplay("transaction.create", "hash-b", NOW)).toThrow(
      IdempotencyKeyReusedError,
    );
  });

  it("rejects the same key replayed against a different operation", () => {
    const record = makeRecord({
      status: "COMPLETED",
      responseBody: { id: "t1" },
      responseStatus: 201,
    });

    expect(() => record.decideReplay("debt.settle", "hash-a", NOW)).toThrow(
      IdempotencyKeyReusedError,
    );
  });

  it("rejects a key whose data differs even while still in flight", () => {
    const record = makeRecord();

    expect(() => record.decideReplay("transaction.create", "hash-b", NOW)).toThrow(
      IdempotencyKeyReusedError,
    );
  });

  it("reports IN_PROGRESS while the original attempt is still running (FR-006)", () => {
    const record = makeRecord({ createdAt: new Date(NOW.getTime() - 5_000) });

    expect(() => record.decideReplay("transaction.create", "hash-a", NOW)).toThrow(
      IdempotencyInProgressError,
    );
  });

  it("TAKES OVER an abandoned in-flight attempt", () => {
    // Safe by construction: an IN_FLIGHT record older than the window cannot
    // have a committed effect behind it, because the effect and the COMPLETED
    // mark commit together.
    const record = makeRecord({ createdAt: new Date(NOW.getTime() - 61_000) });

    expect(record.decideReplay("transaction.create", "hash-a", NOW)).toEqual({
      kind: "TAKE_OVER",
    });
  });

  it("refuses to replay a completed record with no stored status", () => {
    // Would mean the effect committed but `complete()` never truly ran —
    // impossible by design, so it is a bug, not a case to paper over.
    const record = makeRecord({ status: "COMPLETED", responseBody: null, responseStatus: null });

    expect(() => record.decideReplay("transaction.create", "hash-a", NOW)).toThrow();
  });

  it("replays a void (204) result as undefined, not a stray null", () => {
    // Paying an instalment (and any other 204 endpoint) has no body at all —
    // its first response and every replay must agree on that.
    const record = makeRecord({ status: "COMPLETED", responseBody: null, responseStatus: 204 });

    expect(record.decideReplay("transaction.create", "hash-a", NOW)).toEqual({
      kind: "REPLAY",
      body: undefined,
      status: 204,
    });
  });
});
