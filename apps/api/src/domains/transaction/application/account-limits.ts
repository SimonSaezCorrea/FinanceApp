import { toMoney } from "@finance/money";

import type { BankAccountRepositoryPort } from "../../bank-account/domain/ports/bank-account.repository.port";
import type { LegDelta } from "../domain/balance-delta";
import { MovementPolicy } from "../domain/movement-policy";

/** What one write does to one account: its cash balance and its credit pool (signed). */
export interface AccountEffect {
  accountId: string | null | undefined;
  cash?: string;
  pool?: string;
}

/**
 * Called first thing inside a write's transaction (security run-3): locks every account the write
 * moves money on — in id order, so two writers never wait on each other crosswise — and checks the
 * net effect against the locked figures (`MovementPolicy.assertNetEffect`). Every check made before
 * the transaction read a copy another write could change at the same moment; this one can't be
 * raced. Effects on the same account are added up first. An account that isn't the user's is not
 * in the locked set and is skipped here — the owner-scoped writes that follow refuse it.
 */
export async function assertAccountEffectsLocked(
  accounts: Pick<BankAccountRepositoryPort, "lockLimitsWithTx">,
  tx: unknown,
  userId: string,
  effects: readonly AccountEffect[],
): Promise<void> {
  const net = new Map<string, { cash: string; pool: string }>();
  for (const effect of effects) {
    if (!effect.accountId) continue;
    const current = net.get(effect.accountId) ?? { cash: "0", pool: "0" };
    net.set(effect.accountId, {
      cash: toMoney(current.cash)
        .plus(toMoney(effect.cash ?? "0"))
        .toString(),
      pool: toMoney(current.pool)
        .plus(toMoney(effect.pool ?? "0"))
        .toString(),
    });
  }
  if (net.size === 0) return;
  const locked = await accounts.lockLimitsWithTx(tx, userId, [...net.keys()]);
  for (const [accountId, effect] of net) {
    const row = locked.get(accountId);
    if (row) MovementPolicy.assertNetEffect(row, effect);
  }
}

/** A transfer's leg deltas (cash, or the pool on a credit card account) as account effects. */
export function legEffects(deltas: readonly LegDelta[]): AccountEffect[] {
  return deltas.map((d) =>
    d.pool ? { accountId: d.accountId, pool: d.delta } : { accountId: d.accountId, cash: d.delta },
  );
}

/**
 * Moves an account's cash balance after locking it and checking the move against its rules
 * (security run-3) — for writes outside `transaction` that take money from (or bring money to) an
 * account: paying a debt, an instalment or a statement, a savings contribution or withdrawal.
 */
export async function incrementBalanceCheckedWithTx(
  accounts: Pick<BankAccountRepositoryPort, "lockLimitsWithTx" | "incrementBalanceWithTx">,
  tx: unknown,
  userId: string,
  accountId: string,
  delta: string,
): Promise<void> {
  await assertAccountEffectsLocked(accounts, tx, userId, [{ accountId, cash: delta }]);
  await accounts.incrementBalanceWithTx(tx, userId, accountId, delta);
}
