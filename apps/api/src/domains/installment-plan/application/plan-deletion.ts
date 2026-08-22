import type { accounts } from "@finance/contracts";
import { sumMoney } from "@finance/money";

import { isChargedToCredit, reverseBalanceDelta } from "../../transaction/domain/balance-delta";
import type { InstallmentPlanMovement } from "../../transaction/domain/ports/transaction-writer.repository.port";

/** The account each of a plan's movements sits on, as this computation needs it. */
export interface MovementAccount {
  id: string;
  type: accounts.AccountType;
  currency: string;
}

export interface PlanDeletionReversal {
  /** Every movement to delete. */
  movementIds: string[];
  /** What each account's cash balance gets back. */
  balanceRestorations: { accountId: string; amount: string; currency: string }[];
  /** What each credit pool gives back (the finance charge on a credit account). */
  creditReversals: { accountId: string; delta: string }[];
}

/**
 * What deleting a plan undoes — computed ONCE, here, and used by two callers: the
 * confirmation that declares the impact (FR-050b) and the handler that applies it
 * (FR-050a). A second spelling of this arithmetic is precisely how a confirmation
 * ends up promising one thing and the delete doing another.
 *
 * Aggregated PER ACCOUNT because instalments of the same plan can have been paid
 * from different accounts (the plan's remembered account can change between
 * payments, FR-033), and one `increment` per account is what keeps the writes to
 * the number of accounts really involved.
 *
 * A movement charged to credit — the finance charge on a credit-card account — never
 * took cash out, so it gives cash back to nobody; what it releases is the pool.
 */
export function planDeletionReversal(
  movements: InstallmentPlanMovement[],
  accountsById: Map<string, MovementAccount>,
): PlanDeletionReversal {
  const cash = new Map<string, { amounts: string[]; currency: string }>();
  const credit = new Map<string, string[]>();

  for (const movement of movements) {
    const account = movement.bankAccountId
      ? (accountsById.get(movement.bankAccountId) ?? null)
      : null;
    if (!account) continue;
    // No card is ever involved: an instalment is paid from the account, and the
    // finance charge is an issuer charge with no plastic behind it.
    if (isChargedToCredit(account, null)) {
      credit.set(account.id, [...(credit.get(account.id) ?? []), movement.amount]);
      continue;
    }
    const entry = cash.get(account.id) ?? { amounts: [], currency: account.currency };
    entry.amounts.push(reverseBalanceDelta(movement.type, movement.amount));
    cash.set(account.id, entry);
  }

  return {
    movementIds: movements.map((m) => m.id),
    balanceRestorations: [...cash].map(([accountId, { amounts, currency }]) => ({
      accountId,
      amount: sumMoney(amounts),
      currency,
    })),
    creditReversals: [...credit].map(([accountId, amounts]) => ({
      accountId,
      // Negative: the pool gave this credit back when the debt behind it disappeared.
      delta: reverseBalanceDelta("INCOME", sumMoney(amounts)),
    })),
  };
}
