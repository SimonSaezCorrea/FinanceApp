import type { EventBus } from "@nestjs/cqrs";

import { IdempotencyRecord } from "../../domains/idempotency-record/domain/idempotency-record.aggregate";
import type { IdempotencyRecordRepositoryPort } from "../../domains/idempotency-record/domain/ports/idempotency-record.repository.port";
import {
  BaseCommandHandler,
  type HandleResult,
  type UserScopedCommand,
} from "./base-command.handler";
import { requestHash } from "./request-hash";

/** A command that carries the client's attempt identity. */
export type IdempotentCommand = UserScopedCommand & { idempotencyKey: string };

/**
 * Marks the attempt applied. MUST be called with the SAME `tx` the effect is
 * written through — that is the entire safety argument (see below).
 */
export type CompleteFn<TResult> = (tx: unknown, result: TResult) => Promise<void>;

/**
 * Template Method for a write that must be safe to retry (Constitution
 * Principle VII, form (c)).
 *
 * Two phases:
 *
 *   1. RESERVE, in its own transaction. The `@@unique([userId, key])` INSERT is
 *      the mutual exclusion — two simultaneous callers issue it, one wins.
 *   2. EXECUTE, where the effect AND the COMPLETED mark commit in ONE
 *      transaction, via `complete(tx, result)`.
 *
 * Phase 2's atomicity is what makes everything else sound: it means an IN_FLIGHT
 * record ALWAYS implies the effect did not commit, which is why taking over a
 * stale one is safe. Marking COMPLETED *after* the effect commits looks
 * equivalent and is not — a crash in between would leave the effect applied and
 * the attempt reading as un-applied, and the retry would duplicate. That is the
 * exact defect this class exists to remove, so do not "simplify" it.
 *
 * Note on state: Nest handlers are singletons, so nothing about the current
 * attempt may be stored on `this` — every request's reservation lives in a local
 * inside `execute()`.
 */
export abstract class BaseIdempotentCommandHandler<
  TCommand extends IdempotentCommand,
  TResult,
  TContext = unknown,
> extends BaseCommandHandler<TCommand, TResult, TContext> {
  constructor(
    eventBus: EventBus,
    protected readonly records: IdempotencyRecordRepositoryPort,
  ) {
    super(eventBus);
  }

  /** Which operation this handler is, stored so a key replayed against a
   * different one is caught rather than answered with the wrong response. */
  protected abstract readonly operation: string;

  /** HTTP status recorded for the first response, replayed verbatim later. */
  protected readonly successStatus: number = 200;

  /** The payload whose fingerprint detects "same key, different data" (FR-005).
   * Never used to decide whether two operations are the same. */
  protected abstract requestBody(command: TCommand): unknown;

  /**
   * The concrete handler's work. It receives `complete` and MUST call it inside
   * whatever transaction writes the effect.
   */
  protected abstract handleIdempotent(
    command: TCommand,
    context: TContext,
    complete: CompleteFn<TResult>,
  ): Promise<HandleResult<TResult>>;

  /** Not used by this class — `handleIdempotent` replaces it. Kept satisfied so
   * the parent's contract still type-checks. */
  protected handle(): Promise<HandleResult<TResult>> {
    throw new Error("BaseIdempotentCommandHandler uses handleIdempotent()");
  }

  override async execute(command: TCommand): Promise<TResult> {
    const now = new Date();
    const hash = requestHash(this.requestBody(command));
    const plan = IdempotencyRecord.planReservation({
      key: command.idempotencyKey,
      operation: this.operation,
      requestHash: hash,
      now,
    });

    const reservation = await this.records.reserve(command.userId, plan);
    let recordId = reservation.record.id;

    if (reservation.kind === "EXISTS") {
      // Throws IDEMPOTENCY_KEY_REUSED / IDEMPOTENCY_IN_PROGRESS as appropriate.
      const decision = reservation.record.decideReplay(this.operation, hash, now);
      if (decision.kind === "REPLAY") {
        // The first response, verbatim. Nothing is executed.
        return decision.body as TResult;
      }
      const taken = await this.records.takeOver(reservation.record.id, plan);
      recordId = taken.id;
    }

    let completed = false;
    const complete: CompleteFn<TResult> = async (tx, result) => {
      await this.records.completeWithTx(tx, recordId, result, this.successStatus);
      completed = true;
    };

    let outcome: HandleResult<TResult>;
    try {
      const context = await this.loadContext(command);
      outcome = await this.handleIdempotent(command, context, complete);
    } catch (err) {
      // The effect's transaction rolled back, so the COMPLETED update rolled
      // back with it and the record is still IN_FLIGHT. Releasing it is what
      // lets the user fix the input and retry with the same key (FR-004).
      await this.records.release(recordId);
      throw err;
    }

    if (!completed) {
      // Unreachable if the handler is written correctly, and a real hazard if it
      // is not: the effect committed while the attempt still reads as un-applied.
      // Deliberately NOT released — leaving it IN_FLIGHT at least blocks a retry
      // for the in-flight window instead of guaranteeing a duplicate.
      throw new Error(
        `${this.constructor.name} completed its effect without marking the idempotency record. ` +
          `It must call complete(tx, result) inside the same transaction as the effect.`,
      );
    }

    outcome.events.forEach((e) => this.eventBus.publish(e));
    return outcome.result;
  }
}
