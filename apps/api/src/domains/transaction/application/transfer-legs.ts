import type { CreditStatementRepositoryPort } from "../../credit-statement/domain/ports/credit-statement.repository.port";
import { transferLegDelta } from "../domain/balance-delta";
import type {
  TransactionRepositoryPort,
  TransferPair,
} from "../domain/ports/transaction.repository.port";
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

/** What a new transfer says — what the person typed, or what "Transferir pendientes"
 * computed (specs/036). */
export interface NewTransfer {
  fromBankAccountId: string;
  toBankAccountId: string;
  amountOut: string;
  amountIn: string;
  currencyOut: string;
  currencyIn: string;
  occurredAt: Date;
  categoryId?: string | null;
  description?: string | null;
  observation?: string | null;
  emisor?: string | null;
  receptor?: string | null;
  lugar?: string | null;
}

/**
 * Writes a transfer's two legs (EXPENSE out, INCOME in, sharing `transferGroupId`)
 * with both balance moves, inside the caller's transaction. Already validated by
 * `TransferPolicy`. Shared by creating a transfer by hand and by "Transferir
 * pendientes", so both write exactly the same thing.
 */
export async function writeTransferPairWithTx(
  deps: {
    repo: Pick<TransactionRepositoryPort, "saveTransferPairWithTx">;
    statements: Pick<CreditStatementRepositoryPort, "findOrCreateOpenForAccountWithTx">;
  },
  tx: unknown,
  userId: string,
  transferGroupId: string,
  input: NewTransfer,
  from: TransferAccountContext,
  to: TransferAccountContext,
): Promise<TransferPair> {
  const shared = {
    userId,
    occurredAt: input.occurredAt,
    categoryId: input.categoryId ?? null,
    description: input.description ?? null,
    observation: input.observation ?? null,
    emisor: input.emisor ?? null,
    receptor: input.receptor ?? null,
    lugar: input.lugar ?? null,
    cardId: null,
    financeCharge: false,
    installmentPlanId: null,
    creditStatementId: null,
    transferGroupId,
    debtId: null,
    recurringExpenseId: null,
    savingsEntryId: null,
    savingsGoalId: null,
    prepaymentStatementId: null,
    prepaymentAccountId: null,
    settlesStatementId: null,
  };
  const outStatement = await transferLegStatementId(deps.statements, tx, from, input.occurredAt);
  const inStatement = await transferLegStatementId(deps.statements, tx, to, input.occurredAt);
  return deps.repo.saveTransferPairWithTx(
    tx,
    userId,
    {
      ...shared,
      type: "EXPENSE",
      amount: input.amountOut,
      currency: input.currencyOut,
      bankAccountId: input.fromBankAccountId,
      creditStatementId: outStatement,
    },
    {
      ...shared,
      type: "INCOME",
      amount: input.amountIn,
      currency: input.currencyIn,
      bankAccountId: input.toBankAccountId,
      creditStatementId: inStatement,
    },
    [
      transferLegDelta("EXPENSE", input.amountOut, from),
      transferLegDelta("INCOME", input.amountIn, to),
    ],
  );
}
