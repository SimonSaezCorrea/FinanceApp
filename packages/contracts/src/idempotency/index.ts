import { z } from "zod";

/**
 * Idempotency contracts — how a client tells the API that two requests are the
 * SAME attempt (Constitution Principle VII, form (c)).
 *
 * The key identifies the ATTEMPT, never the content. That distinction is the
 * whole point: two genuinely different operations with identical data (two
 * identical coffees on the same day) carry different keys and both go through,
 * while a retry of one attempt carries the same key and applies once.
 */

/** Request header carrying the key. Lowercase — that is how Node normalizes it. */
export const IDEMPOTENCY_HEADER = "idempotency-key";

/**
 * Opaque to the server: the only requirement is that it be long enough not to
 * collide by accident. Clients use `crypto.randomUUID()`.
 */
export const idempotencyKeySchema = z.string().trim().min(16).max(255);
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;

/** How long a completed attempt is remembered before the cleanup cron drops it. */
export const IDEMPOTENCY_RETENTION_HOURS = 24;

/**
 * After this long, an IN_FLIGHT reservation is considered abandoned and may be
 * taken over. Safe because the effect and the COMPLETED mark commit in the SAME
 * transaction: an IN_FLIGHT record therefore always means the effect did NOT
 * commit — unless its transaction is running right now, which cannot outlast
 * this window. See specs/015-idempotent-money-writes/research.md §3.
 */
export const IDEMPOTENCY_IN_FLIGHT_TIMEOUT_SECONDS = 60;

/**
 * Operations that require a key. The value is stored alongside the record so a
 * key replayed against a DIFFERENT operation is caught rather than silently
 * answered with the first operation's response.
 */
export const IDEMPOTENT_OPERATIONS = [
  "transaction.create",
  "transaction.createTransfer",
  "installmentPlan.create",
  "installmentPlan.payInstallment",
  "creditStatement.pay",
  "debt.registerPayment",
  "debt.undoPayment",
  "debt.settle",
  "debt.unsettle",
  "savingsEntry.create",
] as const;

export type IdempotentOperation = (typeof IDEMPOTENT_OPERATIONS)[number];
