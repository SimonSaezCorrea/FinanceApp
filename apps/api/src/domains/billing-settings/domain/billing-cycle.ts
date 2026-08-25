import Holidays from "date-holidays";

import type { accounts } from "@finance/contracts";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Chile only (the MVP's single market). `timezone: "UTC"` matters: every date
 * this module receives/returns is a plain calendar date built with `Date.UTC`
 * (the convention the rest of `bank-account`/`credit-statement` already use),
 * so holidays must be looked up against that same UTC calendar day rather than
 * whatever timezone the process happens to run in.
 */
const chileHolidays = new Holidays("CL", { timezone: "UTC" });
const holidaySetsByYear = new Map<number, Set<string>>();

/** "YYYY-MM-DD" set of Chile's `public` holidays (feriados legales) for `year`,
 * cached — `date-holidays` recomputes its whole-year rule set on every call. */
function holidaysForYear(year: number): Set<string> {
  let set = holidaySetsByYear.get(year);
  if (!set) {
    set = new Set(
      chileHolidays
        .getHolidays(year)
        .filter((h) => h.type === "public")
        .map((h) => h.date.slice(0, 10)),
    );
    holidaySetsByYear.set(year, set);
  }
  return set;
}

/** A "día hábil": not Saturday/Sunday, not a Chilean public holiday. */
export function isBusinessDay(date: Date): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !holidaysForYear(date.getUTCFullYear()).has(date.toISOString().slice(0, 10));
}

/** The date that is the `count`-th business day STRICTLY AFTER `anchor`
 * (`anchor` itself is never counted, business day or not). */
export function addBusinessDays(anchor: Date, count: number): Date {
  let result = anchor;
  let remaining = count;
  while (remaining > 0) {
    result = new Date(result.getTime() + ONE_DAY_MS);
    if (isBusinessDay(result)) remaining -= 1;
  }
  return result;
}

/**
 * Given a credit account's statement cut-off day and the current moment,
 * returns the start of the CURRENT billing cycle — the most recent occurrence
 * of that day-of-month on or before `now` (this month's, or last month's if
 * this month's hasn't happened yet). `1`-`28` only (never 29-31) so every
 * month has that day — no end-of-month clamping needed, matching the same
 * range already used by the (separately unrelated, user-level) profile field
 * `User.billingCycleStartDay`.
 *
 * `null` when no billing day is configured (usage stays all-time), and ALSO
 * for a BUSINESS_DAY cycle: that mode has no fixed day-of-month to anchor
 * on — it closes N business days after whenever the previous period happened
 * to end, which isn't reconstructable from `now` alone. This is the same
 * "no time-window scoping" fallback `billingCycleDay` already answers with
 * when unconfigured; only a card's own independent `CardLimit` sub-limit still
 * consumes this (the account-level pool is a persisted, never-time-scoped
 * total — see CLAUDE.md), and it simply stops scoping to a window for a
 * BUSINESS_DAY account (a documented limitation, not a bug).
 */
export function currentCycleStart(
  billingCycleDay: number | null,
  cycleType: accounts.BillingCycleType,
  now: Date,
): Date | null {
  if (billingCycleDay == null || cycleType === "BUSINESS_DAY") return null;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  if (day >= billingCycleDay) {
    return new Date(Date.UTC(year, month, billingCycleDay));
  }
  return new Date(Date.UTC(year, month - 1, billingCycleDay));
}

/**
 * The boundary at which an OPEN `CreditStatement` starting on `periodStart`
 * should be closed by `BillingGenerationService`. Two cycle types:
 * - CALENDAR_DAY (the original behavior): the first occurrence of
 *   `billingCycleDay` (a day-of-month, 1-28) strictly after `periodStart`.
 * - BUSINESS_DAY (the default going forward): `billingCycleDay` business days
 *   (días hábiles) after `periodStart` — e.g. BCI's real-world 20 días
 *   hábiles counted from the previous period's close.
 */
export function nextBoundaryAfter(
  periodStart: Date,
  billingCycleDay: number,
  cycleType: accounts.BillingCycleType,
): Date {
  if (cycleType === "BUSINESS_DAY") return addBusinessDays(periodStart, billingCycleDay);
  const year = periodStart.getUTCFullYear();
  const month = periodStart.getUTCMonth();
  const candidate = new Date(Date.UTC(year, month, billingCycleDay));
  return candidate > periodStart ? candidate : new Date(Date.UTC(year, month + 1, billingCycleDay));
}

/**
 * The payment due date for a period closed at `closedAt`: `dueBusinessDays`
 * business days directly after the CLOSE itself (e.g. BCI's real-world "3
 * días hábiles" — closed Jul 22 → due Aug 5, with generation's own "20 días
 * hábiles" running the same clock from the same close to the NEXT one, Aug
 * 20). Same mechanism as `nextBoundaryAfter`'s BUSINESS_DAY branch, just
 * anchored to `closedAt` instead of `periodStart` and with its own count.
 * Business days only, for now — there is no calendar-day alternative for a
 * payment due date yet (see `BillingSettings.paymentDueDay`'s doc comment).
 */
export function paymentDueDate(closedAt: Date, dueBusinessDays: number): Date {
  return addBusinessDays(closedAt, dueBusinessDays);
}
