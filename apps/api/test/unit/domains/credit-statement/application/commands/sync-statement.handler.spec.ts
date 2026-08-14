import { describe, expect, it, vi } from "vitest";

import { SyncStatementCommand } from "../../../../../../src/domains/credit-statement/application/commands/sync-statement.command";
import { SyncStatementHandler } from "../../../../../../src/domains/credit-statement/application/commands/sync-statement.handler";
import {
  CreditStatement,
  type CreditStatementProps,
} from "../../../../../../src/domains/credit-statement/domain/credit-statement.aggregate";
import {
  accountAggregate,
  fakeBankAccountRepo,
  fakeCreditStatementRepo,
  fakeTransactionSumsRepo,
  fakeTransactionWriterRepo,
} from "../../../../support/fake-ports";

function statementProps(overrides: Partial<CreditStatementProps> = {}): CreditStatementProps {
  return {
    id: "st_1",
    accountId: "acc_1",
    periodStart: new Date("2026-01-01"),
    closedAt: new Date("2026-02-01"),
    paidAt: null,
    amount: "0",
    paidAmount: "0",
    carriedOverAmount: "0",
    carriedToId: null,
    paidFromAccountId: null,
    paidTransactionId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

/** `$transaction(cb)` just runs the callback — the real atomicity is covered by
 *  the integration suite; here the point is WHAT gets written. */
const prisma = { $transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) => cb({})) };

function setup(statement: CreditStatement, recomputed: string) {
  const account = accountAggregate({
    id: "acc_1",
    type: "CREDIT_LINE",
    creditLimit: "1000000",
    creditUsed: "5000",
  });
  const statementRepo = fakeCreditStatementRepo({ findById: vi.fn(async () => statement) });
  const accountRepo = fakeBankAccountRepo({ findById: vi.fn(async () => account) });
  const sums = fakeTransactionSumsRepo({ netForPeriod: vi.fn(async () => recomputed) });
  const writer = fakeTransactionWriterRepo();
  const handler = new SyncStatementHandler(
    { publish: vi.fn() } as never,
    statementRepo,
    accountRepo,
    sums,
    writer,
    prisma as never,
  );
  return { handler, account, statementRepo, accountRepo, sums, writer };
}

describe("SyncStatementHandler", () => {
  it("recomputes an unpaid period and re-links the movements dated inside it", async () => {
    const statement = CreditStatement.fromPersistence(statementProps());
    const { handler, account, writer } = setup(statement, "7500");

    const result = await handler.execute(new SyncStatementCommand("u1", "acc_1", "st_1"));

    expect(result.amount).toBe("7500.0000");
    expect(writer.relinkToStatementWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ statementId: "st_1", accountId: "acc_1" }),
    );
    // Nothing was paid, so no payment movement is touched and the pool is left be.
    expect(writer.updateAmountWithTx).not.toHaveBeenCalled();
    expect(account.creditUsed).toBe("5000.0000");
  });

  it("brings a settled period's payment movement and credit pool in line", async () => {
    const statement = CreditStatement.fromPersistence(
      statementProps({
        paidAt: new Date("2026-02-05"),
        amount: "1000",
        paidAmount: "1000",
        paidFromAccountId: "acc_2",
        paidTransactionId: "tx_pay",
      }),
    );
    // The period turned out to be worth 1200: 200 more than what was paid.
    const { handler, account, writer } = setup(statement, "1200");

    const result = await handler.execute(new SyncStatementCommand("u1", "acc_1", "st_1"));

    expect(result.amount).toBe("1200.0000");
    expect(result.status).toBe("PAID");
    expect(writer.updateAmountWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "tx_pay",
      "1200.0000",
    );
    // 200 more was really used than the payment released, and editing those
    // movements had deliberately left the pool alone — so it's corrected here.
    expect(account.creditUsed).toBe("4800.0000");
  });

  it("gives credit back when the period shrank", async () => {
    const statement = CreditStatement.fromPersistence(
      statementProps({
        paidAt: new Date("2026-02-05"),
        amount: "1000",
        paidAmount: "1000",
        paidFromAccountId: "acc_2",
        paidTransactionId: "tx_pay",
      }),
    );
    const { handler, account, writer } = setup(statement, "800");

    await handler.execute(new SyncStatementCommand("u1", "acc_1", "st_1"));

    expect(writer.updateAmountWithTx).toHaveBeenCalledWith(expect.anything(), "tx_pay", "800.0000");
    expect(account.creditUsed).toBe("5200.0000");
  });
});
