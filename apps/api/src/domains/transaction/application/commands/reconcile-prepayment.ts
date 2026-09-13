import { subtractMoney, toMoney } from "@finance/money";

import type { BankAccountRepositoryPort } from "../../../bank-account/domain/ports/bank-account.repository.port";
import type { CreditStatementRepositoryPort } from "../../../credit-statement/domain/ports/credit-statement.repository.port";
import type { TransactionWriterRepositoryPort } from "../../domain/ports/transaction-writer.repository.port";

export interface ReconcilePrepaymentDeps {
  statements: CreditStatementRepositoryPort;
  accounts: BankAccountRepositoryPort;
  transactions: TransactionWriterRepositoryPort;
}

export interface ReconcilePrepaymentParams {
  userId: string;
  /** The CREDIT_CARD account the prepago abonó — `Transaction.prepaymentAccountId`. */
  accountId: string;
  /** `Transaction.prepaymentStatementId`. */
  statementId: string;
  /** The prepago movement's amount BEFORE this edit/delete ("0" is never passed
   * here — a reversal always has a real previous amount). */
  oldAmount: string;
  /** Its amount AFTER — `"0"` when the movement is being deleted. */
  newAmount: string;
}

/**
 * Spec 019 (FR-012/FR-013, `research.md` R5/R8): reconciles a `CreditStatement`
 * when the prepago that abonó it is edited or deleted — called from
 * `update-transaction.handler.ts`/`remove-transaction.handler.ts`, inside the
 * SAME `prisma.$transaction` that saves the movement itself, never separately
 * (a crash between the two would leave `prepaidAmount`/`creditUsed` out of
 * step with a movement that no longer says what it once did).
 *
 * The period's row is re-read LOCKED (`findByIdForUpdateWithTx`) here, not
 * earlier in `loadContext` — same reasoning as `PrepayOpenPeriodHandler`'s own
 * lock (R8): the read that decides "how much was really prepaid" must happen
 * under the lock a concurrent prepago/edit would also take.
 *
 * Two cases, mutually exclusive:
 * - The period is still UNSETTLED (OPEN or PENDING, `paidAt === null`): its
 *   `amount` is a LIVE figure (`totalFor`), so correcting `prepaidAmount` and
 *   the credit pool by the plain delta is enough — the next read already shows
 *   the right total, no further bookkeeping needed.
 * - The period is already SETTLED (`paidAt !== null`): its `amount`/
 *   `paidAmount` are FROZEN, so the correction is applied the exact same way
 *   "Sincronizar pagos" already corrects a settled period when ANY of its
 *   movements changes after the fact — reusing `CreditStatement.syncAmount`
 *   rather than inventing a parallel formula.
 */
export async function reconcilePrepaymentWithTx(
  deps: ReconcilePrepaymentDeps,
  tx: unknown,
  params: ReconcilePrepaymentParams,
): Promise<void> {
  const statement = await deps.statements.findByIdForUpdateWithTx(
    tx,
    params.userId,
    params.accountId,
    params.statementId,
  );
  // The FK guarantees the row exists (a prepago always names a real statement);
  // this is defense in depth only, mirroring every other lookup in this file.
  if (!statement) return;

  const breakdown = await deps.statements.breakdown(statement.id);
  const grossTotal = statement.grossTotalFor(breakdown.purchases, breakdown.installments);
  // No OPEN gate here: `oldContribution` (params.oldAmount) is never "0" for a
  // reversal, so `changePrepayment` never checks `canPrepay()` — correcting or
  // undoing an existing prepago is allowed regardless of what happened to the
  // period since (FR-012/FR-013).
  statement.changePrepayment(grossTotal, params.oldAmount, params.newAmount);

  if (statement.paidAt !== null) {
    const newTotal = statement.totalFor(breakdown.purchases, breakdown.installments);
    const { paidDelta, carryOverDelta } = statement.syncAmount(newTotal);
    if (!toMoney(paidDelta).isZero()) {
      const paymentId = statement.paidTransactionId;
      if (paymentId) {
        await deps.transactions.updateAmountWithTx(tx, paymentId, statement.paidAmount);
      }
      const fromAccountId = statement.paidFromAccountId;
      if (fromAccountId) {
        await deps.accounts.incrementBalanceWithTx(
          tx,
          fromAccountId,
          subtractMoney("0", paidDelta),
        );
      }
      await deps.accounts.incrementCreditUsedWithTx(tx, params.accountId, subtractMoney("0", paidDelta));
    }
    const carriedTo = statement.carriedToId;
    if (carriedTo && !toMoney(carryOverDelta).isZero()) {
      await deps.statements.addCarriedOverWithTx(tx, carriedTo, carryOverDelta);
    }
  } else {
    // Unsettled: the period's own total is derived live, so only the pool
    // itself needs the direct correction — more prepaid frees it up, less uses
    // more of it.
    const delta = subtractMoney(params.newAmount, params.oldAmount);
    if (!toMoney(delta).isZero()) {
      await deps.accounts.incrementCreditUsedWithTx(tx, params.accountId, subtractMoney("0", delta));
    }
  }

  await deps.statements.saveWithTx(tx, statement);
}
