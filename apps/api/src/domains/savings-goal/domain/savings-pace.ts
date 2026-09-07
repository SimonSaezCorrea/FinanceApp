import { moneyToString, toMoney } from "@finance/money";

/** Whole calendar months between two dates' own month/year — Jan 15 → Mar 2
 * is 2, same month is 0. Never negative (a goal is never "younger than now"). */
export function monthsElapsed(since: Date, now: Date): number {
  const months =
    (now.getUTCFullYear() - since.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - since.getUTCMonth());
  return Math.max(0, months);
}

/**
 * "Ritmo actual": average of the real aportes in the last 3 complete
 * calendar months (`lastThreeMonthsTotal`, from
 * `SavingsEntryRepositoryPort.sumsByGoal`) — divided by 3, UNLESS the goal is
 * younger than that, in which case it divides by however many months have
 * elapsed since its own creation (minimum 1). A goal with no aportes in the
 * window naturally comes out "0" (spec.md §Clarifications, §Assumptions).
 */
export function computePace(lastThreeMonthsTotal: string, createdAt: Date, now: Date): string {
  const divisor = Math.min(3, Math.max(1, monthsElapsed(createdAt, now)));
  return moneyToString(toMoney(lastThreeMonthsTotal).dividedBy(divisor));
}
