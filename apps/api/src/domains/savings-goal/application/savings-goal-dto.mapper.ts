import type { savings } from "@finance/contracts";

import type { SavingsEntryRepositoryPort } from "../../savings-entry/domain/ports/savings-entry.repository.port";
import { computePace } from "../domain/savings-pace";
import type { SavingsGoal } from "../domain/savings-goal.aggregate";

/**
 * Composes `savings-entry`'s own port to derive `savedAmount`/`pace` — the
 * only place either figure is computed, so a list and a single-goal read can
 * never disagree (same spirit as `credit-statement`'s shared
 * `statement-dto.mapper.ts`). One aggregated query for however many goals are
 * being mapped — never N+1.
 */
export async function toSavingsGoalContracts(
  entries: SavingsEntryRepositoryPort,
  userId: string,
  goals: SavingsGoal[],
  now: Date = new Date(),
): Promise<savings.SavingsGoal[]> {
  const sums = await entries.sumsByGoal(
    userId,
    goals.map((g) => g.id),
    now,
  );
  return goals.map((g) => {
    const snap = g.snapshot();
    const sum = sums.get(g.id) ?? { total: "0", lastThreeMonthsTotal: "0" };
    const pace = computePace(sum.lastThreeMonthsTotal, snap.createdAt, now);
    return g.toContract({ savedAmount: sum.total, pace });
  });
}

export async function toSavingsGoalContract(
  entries: SavingsEntryRepositoryPort,
  userId: string,
  goal: SavingsGoal,
  now: Date = new Date(),
): Promise<savings.SavingsGoal> {
  const [contract] = await toSavingsGoalContracts(entries, userId, [goal], now);
  return contract;
}
