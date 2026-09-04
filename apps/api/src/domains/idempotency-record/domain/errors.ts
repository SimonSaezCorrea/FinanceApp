import { DomainError } from "../../../infra/domain/domain-error";

/**
 * Domain errors for the idempotency mechanism. Language-agnostic codes, mapped
 * to `errors.<CODE>` on the web — the API never returns localized prose.
 */

/** No `Idempotency-Key` on an operation that requires one. A client bug: a user
 * should never see it. Required rather than optional on purpose — an optional
 * key means a forgetful client silently duplicates, and the guarantee stops
 * being a guarantee. */
export class IdempotencyKeyRequiredError extends DomainError {
  constructor() {
    super("IDEMPOTENCY_KEY_REQUIRED", 400, "idempotency-key");
  }
}

/**
 * Same key, different request. Answered rather than silently applying one of the
 * two payloads: the user may have edited the form after a submission that did in
 * fact land, and applying either version silently would be a guess about money.
 *
 * 409, not the 422 the design doc first proposed: `DomainError` deliberately
 * constrains itself to 400/404/409, and a key that contradicts what it already
 * stands for IS a conflict with existing state. Widening a shared infra type for
 * a cosmetic status distinction is not worth it.
 */
export class IdempotencyKeyReusedError extends DomainError {
  constructor() {
    super("IDEMPOTENCY_KEY_REUSED", 409, "idempotency-key");
  }
}

/** The original attempt is still running. The client may retry shortly. */
export class IdempotencyInProgressError extends DomainError {
  constructor() {
    super("IDEMPOTENCY_IN_PROGRESS", 409, "idempotency-key");
  }
}

/**
 * A COMPLETED record with no stored response — impossible by design, since the
 * response is written in the same transaction that marks it complete. Surfaced
 * as a real failure rather than replayed as an empty body, which would hand the
 * client a success that never happened.
 */
export class IdempotencyRecordCorruptError extends DomainError {
  constructor() {
    super("IDEMPOTENCY_RECORD_CORRUPT", 409, "idempotency-key");
  }
}
