import type { accounts } from "@finance/contracts";
import { addMoney, toMoney } from "@finance/money";

import type { CreditStatementRepositoryPort } from "../../credit-statement/domain/ports/credit-statement.repository.port";
import type { DebtRepositoryPort } from "../../debt/domain/ports/debt.repository.port";
import { loadPlanDeletionReversal } from "../../installment-plan/application/plan-deletion.loader";
import type { InstallmentPlanRepositoryPort } from "../../installment-plan/domain/ports/installment-plan.repository.port";
import type { RecurringExpenseRepositoryPort } from "../../recurring-expense/domain/ports/recurring-expense.repository.port";
import type { SavingsEntryRepositoryPort } from "../../savings-entry/domain/ports/savings-entry.repository.port";
import { reverseTransferLegDelta } from "../../transaction/domain/balance-delta";
import type { TransactionWriterRepositoryPort } from "../../transaction/domain/ports/transaction-writer.repository.port";
import type { BankAccount } from "../domain/bank-account.aggregate";
import type { BankAccountRepositoryPort } from "../domain/ports/bank-account.repository.port";

/** A signed change to ANOTHER account's balance or credit pool. */
export interface AccountDelta {
  accountId: string;
  delta: string;
  currency: string;
}

/** A group the user can choose to delete with the account, and what it moves. */
export interface DeletionGroup {
  ids: string[];
  /** Balance of other accounts. */
  balances: AccountDelta[];
  /** Credit pool of other accounts (a plan's finance charge on another card). */
  credits: AccountDelta[];
}

/**
 * Everything deleting one account can take with it, read ONCE and used by both
 * the query that declares it (`GET /accounts/:id/deletion-impact`) and the command
 * that applies it — the same promise-equals-effect rule `plan-deletion` follows.
 */
export interface AccountDeletionScope {
  account: BankAccount;
  movements: DeletionGroup & {
    ownCount: number;
    transfers: number;
    paymentsFromOtherAccounts: number;
  };
  installmentPlans: DeletionGroup & { planIds: string[] };
  recurringIds: string[];
  savingsEntryIds: string[];
  linkedDebts: number;
}

export interface AccountDeletionPorts {
  accounts: Pick<BankAccountRepositoryPort, "findById">;
  transactions: Pick<
    TransactionWriterRepositoryPort,
    "listForAccountDeletion" | "listForInstallmentPlan"
  >;
  statements: Pick<CreditStatementRepositoryPort, "paymentTransactionIdsFromOtherAccounts">;
  plans: Pick<InstallmentPlanRepositoryPort, "listIdsForAccount">;
  recurring: Pick<RecurringExpenseRepositoryPort, "listIdsForAccount">;
  savings: Pick<SavingsEntryRepositoryPort, "listIdsForAccount">;
  debts: Pick<DebtRepositoryPort, "countForAccount">;
}

/** Collapse per-account deltas, dropping this account (it's going away) and zeros. */
export function netByAccount(entries: AccountDelta[], excludeAccountId: string): AccountDelta[] {
  const by = new Map<string, AccountDelta>();
  for (const e of entries) {
    if (e.accountId === excludeAccountId) continue;
    const prev = by.get(e.accountId);
    by.set(e.accountId, {
      accountId: e.accountId,
      currency: e.currency,
      delta: prev ? addMoney(prev.delta, e.delta) : addMoney(e.delta, "0"),
    });
  }
  return [...by.values()].filter((e) => !toMoney(e.delta).isZero());
}

export async function loadAccountDeletionScope(
  userId: string,
  accountId: string,
  ports: AccountDeletionPorts,
): Promise<AccountDeletionScope | null> {
  const account = await ports.accounts.findById(userId, accountId);
  if (!account) return null;
  const cardIds = account.snapshot().cards.map((c) => c.id);

  const [paymentIds, planIds, recurringIds, savingsEntryIds, linkedDebts] = await Promise.all([
    ports.statements.paymentTransactionIdsFromOtherAccounts(userId, accountId),
    ports.plans.listIdsForAccount(userId, accountId, cardIds),
    ports.recurring.listIdsForAccount(userId, accountId, cardIds),
    ports.savings.listIdsForAccount(userId, accountId),
    ports.debts.countForAccount(userId, accountId),
  ]);

  // ── Movements: its own, the other leg of its transfers, and what other
  // accounts paid into its billing periods — each of those gets its money back.
  const rows = await ports.transactions.listForAccountDeletion(userId, accountId, paymentIds);
  const elsewhere = rows.filter((r) => r.bankAccountId !== null && r.bankAccountId !== accountId);
  // A leg on a credit card account (a card payment made from here) gives back
  // pool, not cash — same rule the transfer itself follows.
  const otherTypes = new Map<string, string>();
  for (const id of new Set(elsewhere.map((r) => r.bankAccountId!))) {
    const other = await ports.accounts.findById(userId, id);
    if (other) otherTypes.set(id, other.type);
  }
  const movementBalances: AccountDelta[] = [];
  const movementCredits: AccountDelta[] = [];
  for (const r of elsewhere) {
    const type = otherTypes.get(r.bankAccountId!);
    if (!type) continue;
    const leg = reverseTransferLegDelta(r.type, r.amount, { id: r.bankAccountId!, type });
    (leg.pool ? movementCredits : movementBalances).push({
      accountId: leg.accountId,
      delta: leg.delta,
      currency: r.currency,
    });
  }

  // ── Instalment plans: undone exactly as deleting each plan by hand would.
  const reversals = await Promise.all(
    planIds.map((id) => loadPlanDeletionReversal(userId, id, ports.transactions, ports.accounts)),
  );
  const planBalances = reversals.flatMap((r) =>
    r.balanceRestorations.map((b) => ({
      accountId: b.accountId,
      delta: b.amount,
      currency: b.currency,
    })),
  );
  const planCredits = reversals.flatMap((r) =>
    r.creditReversals.map((c) => ({ accountId: c.accountId, delta: c.delta, currency: "" })),
  );

  return {
    account,
    movements: {
      ids: rows.map((r) => r.id),
      ownCount: rows.length - elsewhere.length,
      transfers: elsewhere.filter((r) => r.transfer).length,
      paymentsFromOtherAccounts: elsewhere.filter((r) => !r.transfer).length,
      balances: netByAccount(movementBalances, accountId),
      credits: netByAccount(movementCredits, accountId),
    },
    installmentPlans: {
      planIds,
      ids: reversals.flatMap((r) => r.movementIds),
      balances: netByAccount(planBalances, accountId),
      credits: netByAccount(planCredits, accountId),
    },
    recurringIds,
    savingsEntryIds,
    linkedDebts,
  };
}

/** The contract shape of a scope, as the confirmation shows it. */
export function deletionImpactDto(scope: AccountDeletionScope): accounts.AccountDeletionImpact {
  const restorations = (deltas: AccountDelta[]) =>
    deltas.map((d) => ({ accountId: d.accountId, amount: d.delta, currency: d.currency }));
  return {
    movements: {
      count: scope.movements.ownCount,
      transfers: scope.movements.transfers,
      paymentsFromOtherAccounts: scope.movements.paymentsFromOtherAccounts,
      restorations: restorations(scope.movements.balances),
    },
    installmentPlans: {
      count: scope.installmentPlans.planIds.length,
      restorations: restorations(scope.installmentPlans.balances),
    },
    recurring: { count: scope.recurringIds.length },
    savingsEntries: { count: scope.savingsEntryIds.length },
    linkedDebts: { count: scope.linkedDebts },
  };
}
