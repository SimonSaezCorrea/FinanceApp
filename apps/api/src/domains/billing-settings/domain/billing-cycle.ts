/**
 * Given a credit account's statement cut-off day (1-28) and the current
 * moment, returns the start of the CURRENT billing cycle — the most recent
 * occurrence of that day on or before `now` (this month's, or last month's if
 * this month's hasn't happened yet). `1`-`28` only (never 29-31) so every
 * month has that day — no end-of-month clamping needed, matching the same
 * range already used by the (separately unrelated, user-level) profile field
 * `User.billingCycleStartDay`.
 *
 * `null` when no billing day is configured: usage stays all-time, same as
 * before this feature existed (backward compatible with existing accounts).
 */
export function currentCycleStart(billingCycleDay: number | null, now: Date): Date | null {
  if (billingCycleDay == null) return null;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  if (day >= billingCycleDay) {
    return new Date(Date.UTC(year, month, billingCycleDay));
  }
  return new Date(Date.UTC(year, month - 1, billingCycleDay));
}

/**
 * The first occurrence of `billingCycleDay` strictly after `periodStart` — the
 * boundary at which an OPEN `CreditStatement` starting on `periodStart` should be
 * closed by `BillingGenerationService`. Same "1-28 only" range as `currentCycleStart`
 * (every month has that day, no end-of-month clamping needed).
 */
export function nextBoundaryAfter(periodStart: Date, billingCycleDay: number): Date {
  const year = periodStart.getUTCFullYear();
  const month = periodStart.getUTCMonth();
  const candidate = new Date(Date.UTC(year, month, billingCycleDay));
  return candidate > periodStart ? candidate : new Date(Date.UTC(year, month + 1, billingCycleDay));
}
