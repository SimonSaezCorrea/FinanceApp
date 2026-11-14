import type { SavingsGoalRepositoryPort } from "../../savings-goal/domain/ports/savings-goal.repository.port";
import { SavingsEntryGoalClosedError, SavingsEntryNotFoundError } from "../domain/errors";
import type { SavingsEntryRepositoryPort } from "../domain/ports/savings-entry.repository.port";
import type { SavingsEntry } from "../domain/savings-entry.aggregate";

/**
 * Inside the transaction that edits or removes a contribution (run-3 deferred unit): locks the
 * goals it belongs to (now, and after the edit) and then the entry itself, re-reads it, and checks
 * again that none of those goals is closed. Closing a goal locks the goal row too
 * (`CloseSavingsGoalHandler`), so the two can no longer interleave — before, removing an entry
 * while its goal was being closed "to an account" returned its money twice: once by reversing the
 * entry, once inside the withdrawal. Goals are locked before the entry, in id order, the same order
 * every caller uses.
 */
export async function lockEntryForChange(
  deps: { entries: SavingsEntryRepositoryPort; goals: SavingsGoalRepositoryPort },
  tx: unknown,
  userId: string,
  stale: SavingsEntry,
  otherGoalIds: readonly (string | null | undefined)[] = [],
): Promise<SavingsEntry> {
  const lockedGoals = new Set<string>();
  const lockGoal = async (goalId: string): Promise<void> => {
    if (lockedGoals.has(goalId)) return;
    lockedGoals.add(goalId);
    const goal = await deps.goals.findOneForUpdateWithTx(tx, userId, goalId);
    if (goal && goal.snapshot().closedAt !== null) throw new SavingsEntryGoalClosedError();
  };
  const goalIds = [stale.savingsGoalId, ...otherGoalIds].filter(
    (id): id is string => typeof id === "string",
  );
  for (const goalId of [...new Set(goalIds)].sort()) await lockGoal(goalId);

  const fresh = await deps.entries.findOneForUpdateWithTx(tx, userId, stale.id);
  if (!fresh) throw new SavingsEntryNotFoundError();
  // Moved to another goal meanwhile: that one must be open too.
  if (fresh.savingsGoalId !== null) await lockGoal(fresh.savingsGoalId);
  return fresh;
}
