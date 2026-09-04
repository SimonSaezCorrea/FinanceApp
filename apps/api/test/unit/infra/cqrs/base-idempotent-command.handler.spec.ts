import type { EventBus } from "@nestjs/cqrs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
} from "../../../../src/domains/idempotency-record/domain/errors";
import {
  IdempotencyRecord,
  type PlannedIdempotencyRecord,
} from "../../../../src/domains/idempotency-record/domain/idempotency-record.aggregate";
import type {
  IdempotencyRecordRepositoryPort,
  ReservationResult,
} from "../../../../src/domains/idempotency-record/domain/ports/idempotency-record.repository.port";
import type { HandleResult } from "../../../../src/infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
  type IdempotentCommand,
} from "../../../../src/infra/cqrs/base-idempotent-command.handler";

const KEY = "b3f1c0de-0000-4000-8000-000000000001";

class FakeCommand implements IdempotentCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly idempotencyKey: string,
    public readonly input: { amount: string },
  ) {}
}

type Effect = { id: string };

/** In-memory stand-in for the table. The unit tier opens zero DB connections
 * (Principle IV), so the `@@unique` collision is simulated here — real mutual
 * exclusion is proven by the integration tests, which is the only place it can be. */
class FakeRecordRepo implements IdempotencyRecordRepositoryPort {
  rows = new Map<string, ReturnType<IdempotencyRecord["snapshot"]>>();
  private seq = 0;

  async reserve(userId: string, plan: PlannedIdempotencyRecord): Promise<ReservationResult> {
    const existing = [...this.rows.values()].find((r) => r.userId === userId && r.key === plan.key);
    if (existing) {
      return { kind: "EXISTS", record: IdempotencyRecord.fromPersistence(existing) };
    }
    const props = { ...plan, id: `ir${++this.seq}`, userId };
    this.rows.set(props.id, props);
    return { kind: "RESERVED", record: IdempotencyRecord.fromPersistence(props) };
  }

  async findByKey(userId: string, key: string) {
    const row = [...this.rows.values()].find((r) => r.userId === userId && r.key === key);
    return row ? IdempotencyRecord.fromPersistence(row) : null;
  }

  async completeWithTx(_tx: unknown, id: string, body: unknown, status: number) {
    const row = this.rows.get(id);
    if (row)
      this.rows.set(id, {
        ...row,
        status: "COMPLETED",
        responseBody: body,
        responseStatus: status,
      });
  }

  async release(id: string) {
    this.rows.delete(id);
  }

  async takeOver(id: string, plan: PlannedIdempotencyRecord) {
    const row = this.rows.get(id)!;
    const next = { ...row, ...plan, id: row.id, userId: row.userId };
    this.rows.set(id, next);
    return IdempotencyRecord.fromPersistence(next);
  }

  async deleteExpired() {
    return 0;
  }
}

class TestHandler extends BaseIdempotentCommandHandler<FakeCommand, Effect, null> {
  protected readonly operation = "test.create";
  protected override readonly successStatus = 201;
  /** Swapped per test to simulate success, business rejection, or a handler bug. */
  behavior: "ok" | "reject" | "forgets-to-complete" = "ok";
  effects: Effect[] = [];

  protected requestBody(command: FakeCommand): unknown {
    return command.input;
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handleIdempotent(
    _command: FakeCommand,
    _context: null,
    complete: CompleteFn<Effect>,
  ): Promise<HandleResult<Effect>> {
    if (this.behavior === "reject") throw new Error("CARD_LIMIT_EXCEEDED");
    const result = { id: `t${this.effects.length + 1}` };
    this.effects.push(result);
    if (this.behavior !== "forgets-to-complete") await complete({}, result);
    return { result, events: [] };
  }
}

function build() {
  const repo = new FakeRecordRepo();
  const eventBus = { publish: vi.fn() } as unknown as EventBus;
  return { repo, handler: new TestHandler(eventBus, repo) };
}

describe("BaseIdempotentCommandHandler", () => {
  let repo: FakeRecordRepo;
  let handler: TestHandler;

  beforeEach(() => {
    ({ repo, handler } = build());
  });

  it("executes the effect once and records the response (first attempt)", async () => {
    const result = await handler.execute(new FakeCommand("u1", KEY, { amount: "12000" }));

    expect(result).toEqual({ id: "t1" });
    expect(handler.effects).toHaveLength(1);
    const [row] = [...repo.rows.values()];
    expect(row.status).toBe("COMPLETED");
    expect(row.responseStatus).toBe(201);
  });

  it("replays the first response without executing again (FR-003)", async () => {
    const command = new FakeCommand("u1", KEY, { amount: "12000" });
    const first = await handler.execute(command);
    const second = await handler.execute(command);

    expect(second).toEqual(first);
    // The point of the whole feature: the effect ran once, not twice.
    expect(handler.effects).toHaveLength(1);
  });

  it("lets two genuinely different operations through when the keys differ (FR-002)", async () => {
    // Identical data — two identical coffees on the same day. Different keys.
    const body = { amount: "12000" };
    await handler.execute(new FakeCommand("u1", `${KEY}-a`, body));
    await handler.execute(new FakeCommand("u1", `${KEY}-b`, body));

    expect(handler.effects).toHaveLength(2);
  });

  it("releases the reservation when the effect is rejected, so the user can retry (FR-004)", async () => {
    handler.behavior = "reject";
    await expect(handler.execute(new FakeCommand("u1", KEY, { amount: "999" }))).rejects.toThrow(
      "CARD_LIMIT_EXCEEDED",
    );
    expect(repo.rows.size).toBe(0);

    handler.behavior = "ok";
    const retry = await handler.execute(new FakeCommand("u1", KEY, { amount: "12000" }));
    expect(retry).toEqual({ id: "t1" });
  });

  it("rejects the same key carrying different data (FR-005)", async () => {
    await handler.execute(new FakeCommand("u1", KEY, { amount: "12000" }));

    await expect(handler.execute(new FakeCommand("u1", KEY, { amount: "99999" }))).rejects.toThrow(
      IdempotencyKeyReusedError,
    );
    expect(handler.effects).toHaveLength(1);
  });

  it("reports IN_PROGRESS while the original attempt is still running (FR-006)", async () => {
    // A reservation exists and is fresh — the other request is mid-flight.
    await repo.reserve("u1", {
      key: KEY,
      operation: "test.create",
      requestHash: "whatever",
      status: "IN_FLIGHT",
      responseBody: null,
      responseStatus: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    // Same data, so it is a genuine retry rather than a reuse.
    const row = [...repo.rows.values()][0];
    repo.rows.set(row.id, {
      ...row,
      requestHash: (await import("../../../../src/infra/cqrs/request-hash")).requestHash({
        amount: "12000",
      }),
    });

    await expect(handler.execute(new FakeCommand("u1", KEY, { amount: "12000" }))).rejects.toThrow(
      IdempotencyInProgressError,
    );
    expect(handler.effects).toHaveLength(0);
  });

  it("takes over an abandoned in-flight reservation and runs", async () => {
    const stale = new Date(Date.now() - 120_000);
    const { requestHash } = await import("../../../../src/infra/cqrs/request-hash");
    await repo.reserve("u1", {
      key: KEY,
      operation: "test.create",
      requestHash: requestHash({ amount: "12000" }),
      status: "IN_FLIGHT",
      responseBody: null,
      responseStatus: null,
      createdAt: stale,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const result = await handler.execute(new FakeCommand("u1", KEY, { amount: "12000" }));

    expect(result).toEqual({ id: "t1" });
    expect(handler.effects).toHaveLength(1);
  });

  it("scopes keys per user — the same key from another account is a fresh attempt", async () => {
    await handler.execute(new FakeCommand("u1", KEY, { amount: "12000" }));
    await handler.execute(new FakeCommand("u2", KEY, { amount: "12000" }));

    expect(handler.effects).toHaveLength(2);
  });

  it("fails loudly if a handler commits its effect without marking the record", async () => {
    // A programming error, not a user-facing case: the effect would be applied
    // while the attempt still reads as un-applied.
    handler.behavior = "forgets-to-complete";

    await expect(handler.execute(new FakeCommand("u1", KEY, { amount: "12000" }))).rejects.toThrow(
      /must call complete\(tx, result\)/,
    );
  });
});
