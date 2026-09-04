import type { IdempotencyRecord, PlannedIdempotencyRecord } from "../idempotency-record.aggregate";

export const IDEMPOTENCY_RECORD_REPOSITORY = Symbol("IDEMPOTENCY_RECORD_REPOSITORY");

/** What `reserve` answers: either we own this attempt, or one already exists. */
export type ReservationResult =
  { kind: "RESERVED"; record: IdempotencyRecord } | { kind: "EXISTS"; record: IdempotencyRecord };

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. */
export interface IdempotencyRecordRepositoryPort {
  /**
   * Inserts the reservation. The `@@unique([userId, key])` constraint IS the
   * mutual exclusion: two simultaneous callers issue the same INSERT, one wins
   * and the other comes back `EXISTS`. The adapter translates the unique
   * violation; the application layer never sees a Prisma error code.
   */
  reserve(userId: string, plan: PlannedIdempotencyRecord): Promise<ReservationResult>;

  /** Always scoped by `userId` — a key guessed from another account resolves to
   * nothing (Principle VIII: an identifier is not authorization). */
  findByKey(userId: string, key: string): Promise<IdempotencyRecord | null>;

  /**
   * Marks the attempt complete and stores its response. Takes the caller's `tx`
   * because it MUST commit together with the effect: writing it afterwards would
   * let a crash in between leave the effect applied while the attempt still reads
   * as un-applied, and the retry would duplicate.
   */
  completeWithTx(tx: unknown, id: string, body: unknown, status: number): Promise<void>;

  /** Drops the reservation after a rejected attempt, so the user can fix the
   * input and try again with the same key (FR-004). */
  release(id: string): Promise<void>;

  /** Reclaims an abandoned IN_FLIGHT reservation, resetting its clock and its
   * request fingerprint. */
  takeOver(id: string, plan: PlannedIdempotencyRecord): Promise<IdempotencyRecord>;

  /** Cron sweep. Returns how many rows were dropped. */
  deleteExpired(now: Date): Promise<number>;
}
