import type { imports } from "@finance/contracts";

import type { BankAccountRepositoryPort } from "../../bank-account/domain/ports/bank-account.repository.port";
import type { CardAccountRepositoryPort } from "../../card-account/domain/ports/card-account.repository.port";
import type { CreditStatementRepositoryPort } from "../../credit-statement/domain/ports/credit-statement.repository.port";
import type { DebtRepositoryPort } from "../../debt/domain/ports/debt.repository.port";
import type { InstallmentPlanRepositoryPort } from "../../installment-plan/domain/ports/installment-plan.repository.port";
import type { RecurringExpenseRepositoryPort } from "../../recurring-expense/domain/ports/recurring-expense.repository.port";
import type { SavingsEntryRepositoryPort } from "../../savings-entry/domain/ports/savings-entry.repository.port";
import type { SavingsGoalRepositoryPort } from "../../savings-goal/domain/ports/savings-goal.repository.port";
import type { TransactionWriterRepositoryPort } from "../../transaction/domain/ports/transaction-writer.repository.port";

/** Every table a template REPLACE empties, each through its own domain's port
 * (Principle VI: one adapter per table). */
export interface ReplacementPorts {
  accounts: BankAccountRepositoryPort;
  cards: CardAccountRepositoryPort;
  statements: CreditStatementRepositoryPort;
  movements: TransactionWriterRepositoryPort;
  debts: DebtRepositoryPort;
  plans: InstallmentPlanRepositoryPort;
  recurring: RecurringExpenseRepositoryPort;
  goals: SavingsGoalRepositoryPort;
  entries: SavingsEntryRepositoryPort;
}

/** What a REPLACE would delete — shown in the preview before confirming. */
export async function countReplacement(
  ports: ReplacementPorts,
  userId: string,
): Promise<imports.TemplateReplacement> {
  const [accounts, cards, movements, debts, plans, recurring, goals, statements] =
    await Promise.all([
      ports.accounts.countForUser(userId),
      ports.cards.countForUser(userId),
      ports.movements.countForUser(userId),
      ports.debts.countForUser(userId),
      ports.plans.countForUser(userId),
      ports.recurring.countForUser(userId),
      ports.goals.countForUser(userId),
      ports.statements.countForUser(userId),
    ]);
  return { accounts, cards, movements, debts, plans, recurring, goals, statements };
}

/**
 * Deletes every account, card and record of the user inside `tx`, in an order the
 * foreign keys allow: movements first (their attachments go with them by cascade),
 * then what pointed at accounts loosely (plans with their instalments, debts,
 * recurring series, savings), and the accounts last — their cards, card limits,
 * billing settings, billing periods and wallet tiles go with them by cascade.
 *
 * Known limitation (same as deleting an account): attachment FILES in object
 * storage are not removed, only their rows.
 */
export async function purgeUserDataWithTx(
  ports: ReplacementPorts,
  tx: unknown,
  userId: string,
): Promise<void> {
  await ports.movements.deleteAllForUserWithTx(tx, userId);
  await ports.plans.deleteAllForUserWithTx(tx, userId);
  await ports.debts.deleteAllForUserWithTx(tx, userId);
  await ports.recurring.deleteAllForUserWithTx(tx, userId);
  await ports.entries.deleteAllForUserWithTx(tx, userId);
  await ports.goals.deleteAllForUserWithTx(tx, userId);
  await ports.accounts.deleteAllForUserWithTx(tx, userId);
}
