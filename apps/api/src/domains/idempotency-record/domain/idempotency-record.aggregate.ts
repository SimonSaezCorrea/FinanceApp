import { idempotency } from "@finance/contracts";

import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
  IdempotencyRecordCorruptError,
} from "./errors";

export type IdempotencyStatus = "IN_FLIGHT" | "COMPLETED";

export interface IdempotencyRecordProps {
  id: string;
  userId: string;
  key: string;
  operation: string;
  requestHash: string;
  status: IdempotencyStatus;
  responseBody: unknown;
  responseStatus: number | null;
  createdAt: Date;
  expiresAt: Date;
}

/** A brand-new reservation, before the adapter assigns `id`/`userId`. */
export type PlannedIdempotencyRecord = Omit<
  IdempotencyRecordProps,
  "id" | "userId" | "createdAt"
> & { createdAt: Date };

/**
 * What to do when a reservation collides with one that already exists. The
 * decision lives here, in the aggregate, rather than in a handler — it is the
 * rule the whole feature turns on, and a handler-side copy could drift.
 */
export type ReplayDecision =
  { kind: "REPLAY"; body: unknown; status: number } | { kind: "TAKE_OVER" };

/**
 * `IdempotencyRecord` aggregate: ONE attempt by the user, so a retry can be told
 * apart from a genuinely new operation (Constitution Principle VII, form (c)).
 *
 * The identity is the client's key — never the request's content. Deriving it
 * from the content would collapse two identical-looking but genuinely different
 * operations (two identical coffees on the same day) into one, which is exactly
 * what FR-002 forbids.
 */
export class IdempotencyRecord {
  private constructor(private props: IdempotencyRecordProps) {}

  static fromPersistence(props: IdempotencyRecordProps): IdempotencyRecord {
    return new IdempotencyRecord({ ...props });
  }

  /** Factory Method: plans a reservation. Starts IN_FLIGHT with no response —
   * the response is written by `complete()`, inside the effect's transaction. */
  static planReservation(input: {
    key: string;
    operation: string;
    requestHash: string;
    now: Date;
  }): PlannedIdempotencyRecord {
    return {
      key: input.key,
      operation: input.operation,
      requestHash: input.requestHash,
      status: "IN_FLIGHT",
      responseBody: null,
      responseStatus: null,
      createdAt: input.now,
      expiresAt: new Date(
        input.now.getTime() + idempotency.IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000,
      ),
    };
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  snapshot(): IdempotencyRecordProps {
    return { ...this.props };
  }

  /** True when this reservation describes the same attempt as the incoming
   * request. Both halves matter: a key belongs to ONE operation carrying ONE
   * payload. */
  matches(operation: string, requestHash: string): boolean {
    return this.props.operation === operation && this.props.requestHash === requestHash;
  }

  /**
   * An IN_FLIGHT reservation older than the window is abandoned and may be taken
   * over. Safe by construction, not by optimism: the effect and the COMPLETED
   * mark commit in the SAME transaction, so an IN_FLIGHT record always means the
   * effect did not commit — unless its transaction is still running, and no
   * transaction here outlasts the window.
   */
  isStale(now: Date): boolean {
    if (this.props.status !== "IN_FLIGHT") return false;
    const elapsedMs = now.getTime() - this.props.createdAt.getTime();
    return elapsedMs > idempotency.IDEMPOTENCY_IN_FLIGHT_TIMEOUT_SECONDS * 1000;
  }

  /**
   * The four outcomes of colliding with an existing reservation
   * (specs/015-idempotent-money-writes/research.md §3).
   */
  decideReplay(operation: string, requestHash: string, now: Date): ReplayDecision {
    // Checked before status: the same key carrying different data is a
    // contradiction whether the original finished or not, and answering it with
    // someone's *other* payload would be a guess about money.
    if (!this.matches(operation, requestHash)) {
      throw new IdempotencyKeyReusedError();
    }

    if (this.props.status === "COMPLETED") {
      // Only `responseStatus` proves a genuine completion: a 204/void operation
      // (e.g. paying an instalment) legitimately has NO body, so `responseBody`
      // being null is not itself a sign of corruption — `undefined` here is what
      // a `void` handler's first response looked like too, so a replay of one
      // must produce the same value, not a stray JSON `null`.
      if (this.props.responseStatus === null) {
        // Impossible by design — the response is written in the same transaction
        // that marks the record complete. Fail loudly instead of replaying an
        // empty result, which would hand the client a success that never happened.
        throw new IdempotencyRecordCorruptError();
      }
      return {
        kind: "REPLAY",
        body: this.props.responseBody ?? undefined,
        status: this.props.responseStatus,
      };
    }

    if (this.isStale(now)) return { kind: "TAKE_OVER" };

    throw new IdempotencyInProgressError();
  }

  /** Records the first response verbatim. MUST be persisted inside the effect's
   * own transaction — that atomicity is the entire safety argument. */
  complete(body: unknown, status: number): void {
    this.props.status = "COMPLETED";
    this.props.responseBody = body;
    this.props.responseStatus = status;
  }
}
