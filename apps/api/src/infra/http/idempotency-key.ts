import { idempotency } from "@finance/contracts";

import { IdempotencyKeyRequiredError } from "../../domains/idempotency-record/domain/errors";

/**
 * Validates the `Idempotency-Key` header for a route where it is mandatory.
 *
 * Not a `PipeTransform`: Nest's `@Headers()` decorator (unlike `@Param`/`@Body`)
 * takes no pipe argument, so this is called directly in the controller method
 * body against the raw header value from `@Headers(IDEMPOTENCY_HEADER)`.
 *
 * Required rather than optional on purpose (see
 * `packages/contracts/src/idempotency/index.ts`): an optional key means a
 * forgetful client silently duplicates, and the guarantee stops being one. A
 * malformed key is treated the same as a missing one — the contract defines a
 * single failure mode here, not a second code for "present but invalid".
 */
export function requireIdempotencyKey(value: unknown): string {
  const result = idempotency.idempotencyKeySchema.safeParse(value);
  if (!result.success) throw new IdempotencyKeyRequiredError();
  return result.data;
}
