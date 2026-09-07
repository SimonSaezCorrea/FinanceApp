import { describe, expect, it, vi } from "vitest";

import { CreateSavingsEntryHandler } from "../../../../../../src/domains/savings-entry/application/commands/create-savings-entry.handler";
import { CreateSavingsEntryCommand } from "../../../../../../src/domains/savings-entry/application/commands/create-savings-entry.command";
import { SavingsEntry } from "../../../../../../src/domains/savings-entry/domain/savings-entry.aggregate";
import {
  SavingsEntryFromCreditAccountError,
  SavingsEntryTitleRequiredError,
} from "../../../../../../src/domains/savings-entry/domain/errors";
import { SavingsGoal } from "../../../../../../src/domains/savings-goal/domain/savings-goal.aggregate";
import { SavingsGoalNotFoundError } from "../../../../../../src/domains/savings-goal/domain/errors";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";
import {
  accountAggregate,
  fakeBankAccountRepo,
  fakeIdempotencyRecordRepo,
  fakePrismaTransaction,
  fakeSavingsEntryRepo,
  fakeSavingsGoalRepo,
  fakeTransactionWriterRepo,
} from "../../../../support/fake-ports";

const KEY = "test-key-0000000000002";
const prisma = fakePrismaTransaction() as unknown as PrismaService;
const account = accountAggregate({ id: "acc1", type: "CHECKING", currency: "USD" });
const accounts = fakeBankAccountRepo({ findById: vi.fn().mockResolvedValue(account) });

function makeGoal(overrides: Partial<Parameters<typeof SavingsGoal.fromPersistence>[0]> = {}) {
  return SavingsGoal.fromPersistence({
    id: "g1",
    userId: "u1",
    title: "Vacaciones",
    targetAmount: "1000",
    currency: "USD",
    deadline: null,
    notes: null,
    color: null,
    closedAt: null,
    closeDestination: null,
    closeAccountId: null,
    closeTransactionId: null,
    closeAmount: null,
    closeTargetGoalId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

describe("CreateSavingsEntryHandler", () => {
  it("converts contributedAt to a Date, moves real money and persists via the repository", async () => {
    const createWithTx = vi.fn().mockImplementation(async (_tx: unknown, userId: string, plan) =>
      SavingsEntry.fromPersistence({
        id: "e1",
        userId,
        ...plan,
        createdAt: new Date("2026-02-01T00:00:00Z"),
      }),
    );
    const repo = fakeSavingsEntryRepo({ createWithTx });
    const incrementBalanceWithTx = vi.fn().mockResolvedValue(undefined);
    const createTransaction = vi.fn().mockResolvedValue(undefined);
    const handler = new CreateSavingsEntryHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      fakeSavingsGoalRepo(),
      fakeBankAccountRepo({ findById: vi.fn().mockResolvedValue(account), incrementBalanceWithTx }),
      fakeTransactionWriterRepo({ createWithTx: createTransaction }),
      prisma,
    );

    const result = await handler.execute(
      new CreateSavingsEntryCommand(
        "u1",
        {
          amount: "250",
          currency: "USD",
          contributedAt: "2026-02-01T00:00:00.000Z",
          bankAccountId: "acc1",
          title: "Vuelto proyecto freelance",
        },
        KEY,
      ),
    );

    expect(result.id).toBe("e1");
    expect(result.amount).toBe("250.0000");
    expect(createWithTx.mock.calls[0]![2].contributedAt).toBeInstanceOf(Date);
    expect(createWithTx.mock.calls[0]![2].savingsGoalId).toBeNull();
    expect(createWithTx.mock.calls[0]![2].bankAccountId).toBe("acc1");
    expect(createTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "EXPENSE", amount: "250", bankAccountId: "acc1" }),
    );
    expect(incrementBalanceWithTx).toHaveBeenCalledWith(expect.anything(), "acc1", "-250.0000");
  });

  it("throws SavingsEntryTitleRequiredError for an ahorro-libre aporte with no title", async () => {
    const handler = new CreateSavingsEntryHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      fakeSavingsEntryRepo(),
      fakeSavingsGoalRepo(),
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );

    await expect(
      handler.execute(
        new CreateSavingsEntryCommand(
          "u1",
          {
            amount: "250",
            currency: "USD",
            contributedAt: "2026-02-01T00:00:00.000Z",
            bankAccountId: "acc1",
          },
          KEY,
        ),
      ),
    ).rejects.toBeInstanceOf(SavingsEntryTitleRequiredError);
  });

  it("throws SavingsGoalNotFoundError when savingsGoalId isn't the caller's", async () => {
    const goals = fakeSavingsGoalRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new CreateSavingsEntryHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      fakeSavingsEntryRepo(),
      goals,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );

    await expect(
      handler.execute(
        new CreateSavingsEntryCommand(
          "u1",
          {
            savingsGoalId: "foreign-goal",
            amount: "250",
            currency: "USD",
            contributedAt: "2026-02-01T00:00:00.000Z",
            bankAccountId: "acc1",
          },
          KEY,
        ),
      ),
    ).rejects.toBeInstanceOf(SavingsGoalNotFoundError);
  });

  it("throws SavingsEntryFromCreditAccountError for a CREDIT_CARD source account", async () => {
    const creditAccount = accountAggregate({ id: "acc2", type: "CREDIT_CARD", currency: "USD" });
    const handler = new CreateSavingsEntryHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      fakeSavingsEntryRepo(),
      fakeSavingsGoalRepo(),
      fakeBankAccountRepo({ findById: vi.fn().mockResolvedValue(creditAccount) }),
      fakeTransactionWriterRepo(),
      prisma,
    );

    await expect(
      handler.execute(
        new CreateSavingsEntryCommand(
          "u1",
          {
            amount: "250",
            currency: "USD",
            contributedAt: "2026-02-01T00:00:00.000Z",
            bankAccountId: "acc2",
          },
          KEY,
        ),
      ),
    ).rejects.toBeInstanceOf(SavingsEntryFromCreditAccountError);
  });

  it("replays the same result on a retried attempt instead of creating twice", async () => {
    const createWithTx = vi.fn().mockImplementation(async (_tx: unknown, userId: string, plan) =>
      SavingsEntry.fromPersistence({
        id: "e1",
        userId,
        ...plan,
        createdAt: new Date("2026-02-01T00:00:00Z"),
      }),
    );
    const repo = fakeSavingsEntryRepo({ createWithTx });
    const goals = fakeSavingsGoalRepo({ findOne: vi.fn().mockResolvedValue(makeGoal()) });
    const records = fakeIdempotencyRecordRepo();
    const handler = new CreateSavingsEntryHandler(
      { publish: vi.fn() } as never,
      records,
      repo,
      goals,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );
    const command = new CreateSavingsEntryCommand(
      "u1",
      {
        savingsGoalId: "g1",
        amount: "250",
        currency: "USD",
        contributedAt: "2026-02-01T00:00:00.000Z",
        bankAccountId: "acc1",
      },
      KEY,
    );

    const first = await handler.execute(command);
    const second = await handler.execute(command);

    expect(second).toEqual(first);
    expect(createWithTx).toHaveBeenCalledTimes(1);
  });
});
