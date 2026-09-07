import { toMoney } from "@finance/money";

/**
 * A goal may only be closed once it is "cumplida" (saved ≥ target) or
 * "vencida" (incomplete, past its deadline) — never while merely "en curso"
 * or "sin aportes". Pure so it can be unit-tested without a database (T054).
 */
export function isSavingsGoalCloseable(
  savedAmount: string,
  targetAmount: string,
  deadline: Date | null,
  now: Date,
): boolean {
  const complete = toMoney(savedAmount).greaterThanOrEqualTo(toMoney(targetAmount));
  if (complete) return true;
  if (deadline === null) return false;
  return deadline.getTime() < now.getTime();
}
