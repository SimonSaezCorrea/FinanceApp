import type { transactions } from "@finance/contracts";

/**
 * Which of a movement's own actions the API accepts — ONE rule for every place that offers them
 * (the table's row buttons, the swipe and the menu, the detail panel), so none offers an action
 * that can only end in an error.
 *
 * - A movement that backs an instalment, settles a statement in another currency or is the charge
 *   of a transfer (spec 028 US3) is corrected from where it came from: neither edited nor deleted.
 *   Except a prepayment in another currency (`settlementPairId`): deleting either leg undoes it.
 * - A statement's payment (`paidStatementId`) is never edited here ("Modificar pago" does that),
 *   but deleting it undoes the whole payment, like "Deshacer pago".
 */
export function movementActions(tx: transactions.Transaction): { edit: boolean; delete: boolean } {
  const lockedToSource =
    tx.installmentPlanId !== null ||
    tx.settlesStatementId !== null ||
    (tx.transferStatementId ?? null) !== null;
  const foreignPrepayment = (tx.settlementPairId ?? null) !== null;
  const statementPayment = (tx.paidStatementId ?? null) !== null;
  return {
    edit: !lockedToSource && !statementPayment,
    delete: !lockedToSource || foreignPrepayment,
  };
}
