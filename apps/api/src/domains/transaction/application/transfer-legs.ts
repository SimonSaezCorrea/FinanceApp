import type { CreditStatementRepositoryPort } from "../../credit-statement/domain/ports/credit-statement.repository.port";
import type { TransferAccountContext } from "../domain/transfer-policy";

/**
 * The billing period a transfer leg belongs to. A leg on a credit card account —
 * paying the card, or a cash advance out of it — joins that account's OPEN period
 * in its own currency, exactly like any other income or expense there, so the
 * period's total and the pool keep agreeing. A leg on any other account has none.
 */
export async function transferLegStatementId(
  statements: Pick<CreditStatementRepositoryPort, "findOrCreateOpenForAccountWithTx">,
  tx: unknown,
  account: TransferAccountContext | null,
  occurredAt?: Date,
): Promise<string | null> {
  if (!account || account.type !== "CREDIT_CARD") return null;
  const period = await statements.findOrCreateOpenForAccountWithTx(
    tx,
    account.id,
    account.createdAt ?? new Date(),
    account.currency ?? "CLP",
    occurredAt,
  );
  return period.id;
}
