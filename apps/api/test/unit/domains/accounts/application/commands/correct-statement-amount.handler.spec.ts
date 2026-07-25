import { describe, expect, it, vi } from "vitest";

import { CorrectStatementAmountHandler } from "../../../../../../src/domains/accounts/application/commands/correct-statement-amount.handler";
import { CorrectStatementAmountCommand } from "../../../../../../src/domains/accounts/application/commands/correct-statement-amount.command";
import { CreditStatement, type CreditStatementProps } from "../../../../../../src/domains/accounts/domain/credit-statement.aggregate";
import { StatementNotFoundError, StatementNotPaidError } from "../../../../../../src/domains/accounts/domain/errors";
import type { CreditStatementRepositoryPort } from "../../../../../../src/domains/accounts/domain/ports/credit-statement.repository.port";

function statementProps(overrides: Partial<CreditStatementProps> = {}): CreditStatementProps {
  return {
    id: "st_1",
    accountId: "acc_1",
    periodStart: new Date("2026-01-01"),
    closedAt: new Date("2026-02-01"),
    paidAt: new Date("2026-02-05"),
    amount: "1000",
    paidFromAccountId: "acc_2",
    paidTransactionId: "tx_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeStatementRepo(overrides: Partial<CreditStatementRepositoryPort> = {}): CreditStatementRepositoryPort {
  return {
    findById: vi.fn(),
    findOpenForAccount: vi.fn(),
    listForAccount: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    sumLinkedTransactions: vi.fn(),
    ...overrides,
  };
}

describe("CorrectStatementAmountHandler", () => {
  it("corrects a PAID statement's frozen amount and persists it", async () => {
    const statement = CreditStatement.fromPersistence(statementProps());
    const statementRepo = fakeStatementRepo({ findById: vi.fn(async () => statement), save: vi.fn(async () => undefined) });
    const handler = new CorrectStatementAmountHandler({ publish: vi.fn() } as never, statementRepo);

    const result = await handler.execute(new CorrectStatementAmountCommand("u1", "acc_1", "st_1", "950"));

    expect(result.amount).toBe("950.0000");
    expect(statementRepo.save).toHaveBeenCalledWith(statement);
  });

  it("rejects correcting a non-PAID statement", async () => {
    const statement = CreditStatement.fromPersistence(statementProps({ paidAt: null }));
    const statementRepo = fakeStatementRepo({ findById: vi.fn(async () => statement) });
    const handler = new CorrectStatementAmountHandler({ publish: vi.fn() } as never, statementRepo);

    await expect(
      handler.execute(new CorrectStatementAmountCommand("u1", "acc_1", "st_1", "950")),
    ).rejects.toThrow(StatementNotPaidError);
  });

  it("throws StatementNotFoundError when the statement doesn't exist", async () => {
    const statementRepo = fakeStatementRepo({ findById: vi.fn(async () => null) });
    const handler = new CorrectStatementAmountHandler({ publish: vi.fn() } as never, statementRepo);

    await expect(
      handler.execute(new CorrectStatementAmountCommand("u1", "acc_1", "missing", "950")),
    ).rejects.toThrow(StatementNotFoundError);
  });
});
