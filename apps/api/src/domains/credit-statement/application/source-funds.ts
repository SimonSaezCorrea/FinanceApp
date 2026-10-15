import type { BankAccount } from "../../bank-account/domain/bank-account.aggregate";
import { MovementPolicy } from "../../transaction/domain/movement-policy";

/**
 * The source account of a statement payment, a prepayment or a corrected payment must be able
 * to cover what leaves it — the same account rules every other EXPENSE obeys (paying an
 * instalment, a debt, an ordinary movement): a prepaid account never goes negative, and an
 * account with a declared overdraft never goes past its floor. A bare low balance on an
 * account that MAY go negative is not a refusal (the bank may have allowed it).
 *
 * `offset` is what this same payment already took off the balance (a correction is checked
 * against the balance as it was BEFORE its own old debit).
 */
export function assertSourceCovers(source: BankAccount, charged: string, offset = "0"): void {
  const account = source.snapshot();
  const movement = { type: "EXPENSE" as const, amount: charged };
  MovementPolicy.assertWithinPrepaidBalance(
    movement,
    { type: account.type, currentBalance: source.currentBalance },
    offset,
  );
  MovementPolicy.assertWithinOverdraft(
    movement,
    {
      type: account.type,
      currentBalance: source.currentBalance,
      overdraftLimit: account.overdraftLimit,
    },
    offset,
  );
}
