import type { BankAccountRepositoryPort } from "../../bank-account/domain/ports/bank-account.repository.port";
import type { TransactionWriterRepositoryPort } from "../../transaction/domain/ports/transaction-writer.repository.port";
import {
  planDeletionReversal,
  type MovementAccount,
  type PlanDeletionReversal,
} from "./plan-deletion";

/**
 * Reads what a plan's deletion would reverse, through the two ports that own the
 * data (`transaction` for the movements, `bank-account` for the accounts they sit
 * on) and hands it to the pure arithmetic.
 *
 * Shared by the query that DECLARES the impact and the command that APPLIES it, so
 * the confirmation and the delete can never describe different things.
 */
export async function loadPlanDeletionReversal(
  userId: string,
  planId: string,
  transactions: Pick<TransactionWriterRepositoryPort, "listForInstallmentPlan">,
  accounts: Pick<BankAccountRepositoryPort, "findById">,
): Promise<PlanDeletionReversal> {
  const movements = await transactions.listForInstallmentPlan(userId, planId);
  const accountIds = [
    ...new Set(movements.map((m) => m.bankAccountId).filter((id) => id !== null)),
  ];
  const entries = await Promise.all(
    accountIds.map(async (id) => {
      const account = await accounts.findById(userId, id);
      if (!account) return null;
      const snap = account.snapshot();
      return [id, { id, type: snap.type, currency: snap.currency }] as [string, MovementAccount];
    }),
  );
  return planDeletionReversal(
    movements,
    new Map(entries.filter((e): e is [string, MovementAccount] => e !== null)),
  );
}
