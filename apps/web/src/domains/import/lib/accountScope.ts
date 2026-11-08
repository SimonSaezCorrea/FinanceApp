import type { ExistingData, ExistingRows } from "./templateData";

/**
 * The part of the user's data one account is involved in, for a template pre-filled "with this
 * account's data" (Importar → an account → Descargar plantilla):
 *  - its movements, and the OTHER leg of each of its transfers (a transfer row needs both);
 *  - its billing periods;
 *  - the debts, plans and fixed expenses its movements pay, or that name it (payment account,
 *    a card of it, the account a series is paid from), and the savings contributions made from it
 *    with their goals.
 * Every account stays in the list: the rows name other accounts (a transfer's other side), and
 * `scopeExistingRows` then keeps only this account and its cards on their own sheets.
 */
export function scopeExistingData(data: ExistingData, accountId: string): ExistingData {
  const account = data.accounts.find((a) => a.id === accountId);
  const cardIds = new Set((account?.cards ?? []).map((c) => c.id));

  const groups = new Set(
    data.transactions
      .filter((tx) => tx.bankAccountId === accountId && tx.transferGroupId)
      .map((tx) => tx.transferGroupId as string),
  );
  const transactions = data.transactions.filter(
    (tx) =>
      tx.bankAccountId === accountId ||
      (tx.transferGroupId !== null && groups.has(tx.transferGroupId)),
  );
  const own = transactions.filter((tx) => tx.bankAccountId === accountId);
  const paid = (key: "debtId" | "installmentPlanId" | "recurringExpenseId") =>
    new Set(own.map((tx) => tx[key]).filter((id): id is string => Boolean(id)));
  const debtIds = paid("debtId");
  const planIds = paid("installmentPlanId");
  const recurringIds = paid("recurringExpenseId");

  const entries = data.entries.filter((e) => e.bankAccountId === accountId);
  const goalIds = new Set(entries.map((e) => e.savingsGoalId).filter(Boolean));

  return {
    ...data,
    transactions,
    statements: data.statements.filter((s) => s.accountId === accountId),
    debts: data.debts.filter((d) => debtIds.has(d.id) || d.paymentAccountId === accountId),
    plans: data.plans.filter(
      (p) =>
        planIds.has(p.id) ||
        p.paymentAccountId === accountId ||
        (p.cardId !== null && cardIds.has(p.cardId)),
    ),
    recurring: data.recurring.filter(
      (r) => recurringIds.has(r.id) || r.bankAccountId === accountId,
    ),
    entries,
    goals: data.goals.filter((g) => goalIds.has(g.id)),
  };
}

/** The pre-filled rows of one account: its own row on Cuentas and its cards on Tarjetas; every
 * other sheet already holds only what `scopeExistingData` kept. */
export function scopeExistingRows(
  rows: ExistingRows,
  account: { id: string; cards?: { id: string }[] },
): ExistingRows {
  const cardIds = new Set((account.cards ?? []).map((c) => c.id));
  return {
    ...rows,
    accounts: rows.accounts.filter((r) => r.id === account.id),
    cards: rows.cards.filter((r) => cardIds.has(r.id)),
  };
}
