import { subtractMoney } from "@finance/money";

import type { BankAccountRepositoryPort } from "../../bank-account/domain/ports/bank-account.repository.port";
import type { InstallmentPlanRepositoryPort } from "../../installment-plan/domain/ports/installment-plan.repository.port";
import type { TransactionWriterRepositoryPort } from "../../transaction/domain/ports/transaction-writer.repository.port";
import type { CreditStatement } from "../domain/credit-statement.aggregate";
import { PaymentCarryOverSettledError, StatementNotFoundError } from "../domain/errors";
import type { CreditStatementRepositoryPort } from "../domain/ports/credit-statement.repository.port";

export interface StatementPaymentUndoDeps {
  statements: CreditStatementRepositoryPort;
  accounts: BankAccountRepositoryPort;
  transactions: TransactionWriterRepositoryPort;
  plans: InstallmentPlanRepositoryPort;
}

/**
 * "Deshacer pago": the exact mirror of paying a statement (`PayCreditStatementHandler`), applying
 * `statement.undoPayment()` — the same `paymentReversal` the confirmation showed — inside the
 * caller's `$transaction`. ONE function for both ways in (the statement's own button and deleting
 * one of the payment's movements from Movimientos), so they can never undo different things:
 *
 * - the payment's movements go: the source EXPENSE and, for a period in another currency, the
 *   settlement INCOME on the card (which frees that limit back up);
 * - what left the source account comes back to it (its own figure: the pesos, for a USD period);
 * - in the account's own currency, what was paid goes back onto the pool (`creditUsed`), and every
 *   instalment the period charged is unpaid again (BILLED);
 * - a shortfall carried forward leaves the period that received it — refused once that one is
 *   settled itself (`PAYMENT_CARRY_OVER_SETTLED`): it was paid, and undoing would rewrite it.
 *
 * The statement is read LOCKED (and its successor too), so a payment racing this serializes.
 * Returns the statement, back to PENDING, for the caller to answer with.
 */
export async function undoStatementPaymentWithTx(
  deps: StatementPaymentUndoDeps,
  tx: unknown,
  input: { userId: string; accountId: string; statementId: string; accountCurrency: string },
): Promise<CreditStatement> {
  const statement = await deps.statements.findByIdForUpdateWithTx(
    tx,
    input.userId,
    input.accountId,
    input.statementId,
  );
  if (!statement) throw new StatementNotFoundError();
  // Throws STATEMENT_NOT_PAID / STATEMENT_PAYMENT_NOT_UNDOABLE when there is nothing to undo.
  const reversal = statement.undoPayment(input.accountCurrency);

  if (reversal.carriedToId) {
    const successor = await deps.statements.findByIdForUpdateWithTx(
      tx,
      input.userId,
      input.accountId,
      reversal.carriedToId,
    );
    if (successor && (successor.paidAt !== null || successor.transferredAt !== null)) {
      throw new PaymentCarryOverSettledError();
    }
    if (successor) {
      await deps.statements.addCarriedOverWithTx(
        tx,
        successor.id,
        subtractMoney("0", reversal.carryOver),
      );
    }
  }

  // What really left the source: the payment movement's own amount (the pesos of a USD period).
  // A movement deleted before this existed already gave its money back, so nothing returns then.
  if (reversal.paymentTransactionId) {
    const charged = await deps.transactions.amountForTransaction(
      input.userId,
      reversal.paymentTransactionId,
    );
    const sourceId = await deps.transactions.accountIdForTransaction(
      input.userId,
      reversal.paymentTransactionId,
    );
    if (charged !== null && sourceId) {
      await deps.accounts.incrementBalanceWithTx(tx, sourceId, charged);
    }
  }
  await deps.transactions.deleteManyWithTx(
    tx,
    [reversal.paymentTransactionId, reversal.settlementTransactionId].filter(
      (id): id is string => id !== null,
    ),
  );

  if (reversal.restoresCredit) {
    await deps.accounts.incrementCreditUsedWithTx(tx, input.accountId, reversal.paidAmount);
    await deps.plans.unsettleForStatementWithTx(tx, statement.id);
  }

  await deps.statements.saveWithTx(tx, statement);
  return statement;
}
