import { describe, expect, it, vi } from "vitest";

import type { debts } from "@finance/contracts";

import { RegisterDebtPaymentHandler } from "../../../../../../src/domains/debt/application/commands/register-debt-payment.handler";
import { RegisterDebtPaymentCommand } from "../../../../../../src/domains/debt/application/commands/register-debt-payment.command";
import { UndoDebtPaymentHandler } from "../../../../../../src/domains/debt/application/commands/undo-debt-payment.handler";
import { UndoDebtPaymentCommand } from "../../../../../../src/domains/debt/application/commands/undo-debt-payment.command";
import { Debt } from "../../../../../../src/domains/debt/domain/debt.aggregate";
import {
  AllInstallmentsPaidError,
  DebtAlreadySettledError,
  DebtNotFoundError,
  NoPaymentsToUndoError,
} from "../../../../../../src/domains/debt/domain/errors";
import type { DebtRepositoryPort } from "../../../../../../src/domains/debt/domain/ports/debt.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";
import {
  accountAggregate,
  fakeBankAccountRepo,
  fakeIdempotencyRecordRepo,
  fakePrismaTransaction,
  fakeTransactionWriterRepo,
} from "../../../../support/fake-ports";

const KEY = "test-key-0000000000001";
const prisma = fakePrismaTransaction() as unknown as PrismaService;
const account = accountAggregate({ id: "acc1", type: "CHECKING", currency: "USD" });
const accounts = fakeBankAccountRepo({ findById: vi.fn().mockResolvedValue(account) });
const PAY: debts.PayDebt = { accountId: "acc1" };

function makeDebt(overrides: Partial<Parameters<typeof Debt.fromPersistence>[0]> = {}) {
  return Debt.fromPersistence({
    id: "d1",
    userId: "u1",
    direction: "YOU_OWE",
    counterparty: "Acme Corp",
    principal: "1200",
    currency: "USD",
    openedAt: new Date("2026-01-01T00:00:00Z"),
    dueAt: null,
    interestApr: null,
    notes: null,
    settledAt: null,
    totalInstallments: 3,
    paidInstallments: 0,
    installmentAmount: null,
    frequency: "MONTHLY",
    frequencyInterval: 1,
    paymentAccountId: null,
    lastPaymentTransactionId: null,
    lastPaymentAccountId: null,
    lastPaymentAmount: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

function fakeRepo(overrides: Partial<DebtRepositoryPort> = {}): DebtRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    findOneForUpdateWithTx: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

describe("RegisterDebtPaymentHandler", () => {
  it("throws DebtNotFoundError when the debt is not the user's", async () => {
    const repo = fakeRepo({ findOneForUpdateWithTx: vi.fn().mockResolvedValue(null) });
    const handler = new RegisterDebtPaymentHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );
    await expect(
      handler.execute(new RegisterDebtPaymentCommand("u1", "ghost", KEY, PAY)),
    ).rejects.toBeInstanceOf(DebtNotFoundError);
  });

  it("throws DebtAlreadySettledError if already settled", async () => {
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi.fn().mockResolvedValue(makeDebt({ settledAt: new Date() })),
    });
    const handler = new RegisterDebtPaymentHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );
    await expect(
      handler.execute(new RegisterDebtPaymentCommand("u1", "d1", KEY, PAY)),
    ).rejects.toBeInstanceOf(DebtAlreadySettledError);
  });

  it("throws AllInstallmentsPaidError if all installments already paid", async () => {
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi
        .fn()
        .mockResolvedValue(makeDebt({ totalInstallments: 3, paidInstallments: 3 })),
    });
    const handler = new RegisterDebtPaymentHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );
    await expect(
      handler.execute(new RegisterDebtPaymentCommand("u1", "d1", KEY, PAY)),
    ).rejects.toBeInstanceOf(AllInstallmentsPaidError);
  });

  it("increments paidInstallments, records a real movement and persists it", async () => {
    const saveWithTx = vi.fn().mockResolvedValue(undefined);
    const createWithTx = vi.fn().mockResolvedValue(undefined);
    const incrementBalanceWithTx = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi
        .fn()
        .mockResolvedValue(makeDebt({ totalInstallments: 3, paidInstallments: 1 })),
      saveWithTx,
    });
    const handler = new RegisterDebtPaymentHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      fakeBankAccountRepo({ findById: vi.fn().mockResolvedValue(account), incrementBalanceWithTx }),
      fakeTransactionWriterRepo({ createWithTx }),
      prisma,
    );
    const result = await handler.execute(new RegisterDebtPaymentCommand("u1", "d1", KEY, PAY));
    expect(result.paidInstallments).toBe(2);
    expect(saveWithTx).toHaveBeenCalled();
    // YOU_OWE, no installmentAmount: one instalment = 1200 / 3 = 400, an EXPENSE.
    expect(createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "EXPENSE", amount: "400.0000", bankAccountId: "acc1" }),
    );
    expect(incrementBalanceWithTx).toHaveBeenCalledWith(expect.anything(), "acc1", "-400.0000");
  });

  it("auto-settles when the last payment is registered", async () => {
    const saveWithTx = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi
        .fn()
        .mockResolvedValue(makeDebt({ totalInstallments: 3, paidInstallments: 2 })),
      saveWithTx,
    });
    const handler = new RegisterDebtPaymentHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );
    const result = await handler.execute(new RegisterDebtPaymentCommand("u1", "d1", KEY, PAY));
    expect(result.paidInstallments).toBe(3);
    expect(result.settledAt).not.toBeNull();
  });

  // The exact case idempotency protects against: a duplicate submit used to
  // silently advance the counter twice. This confirms the SAME key replays
  // rather than re-executing (`registerPayment()` would throw the second time
  // it genuinely ran, since T045/047's guards make a re-run visible).
  it("replays the same result on a retried attempt instead of registering twice", async () => {
    const saveWithTx = vi.fn().mockResolvedValue(undefined);
    const debt = makeDebt({ totalInstallments: 3, paidInstallments: 1 });
    const repo = fakeRepo({ findOneForUpdateWithTx: vi.fn().mockResolvedValue(debt), saveWithTx });
    const records = fakeIdempotencyRecordRepo();
    const handler = new RegisterDebtPaymentHandler(
      { publish: vi.fn() } as never,
      records,
      repo,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );
    const command = new RegisterDebtPaymentCommand("u1", "d1", KEY, PAY);

    const first = await handler.execute(command);
    const second = await handler.execute(command);

    expect(second).toEqual(first);
    expect(saveWithTx).toHaveBeenCalledTimes(1);
  });
});

describe("UndoDebtPaymentHandler", () => {
  it("throws DebtNotFoundError when the debt is not the user's", async () => {
    const repo = fakeRepo({ findOneForUpdateWithTx: vi.fn().mockResolvedValue(null) });
    const handler = new UndoDebtPaymentHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );
    await expect(
      handler.execute(new UndoDebtPaymentCommand("u1", "ghost", KEY)),
    ).rejects.toBeInstanceOf(DebtNotFoundError);
  });

  it("throws NoPaymentsToUndoError if nothing was paid", async () => {
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi.fn().mockResolvedValue(makeDebt({ paidInstallments: 0 })),
    });
    const handler = new UndoDebtPaymentHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );
    await expect(
      handler.execute(new UndoDebtPaymentCommand("u1", "d1", KEY)),
    ).rejects.toBeInstanceOf(NoPaymentsToUndoError);
  });

  it("decrements paidInstallments, clears settledAt if it was settled, with nothing to reverse for a payment recorded before this feature", async () => {
    const saveWithTx = vi.fn().mockResolvedValue(undefined);
    const deleteWithTx = vi.fn();
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi
        .fn()
        .mockResolvedValue(
          makeDebt({ totalInstallments: 3, paidInstallments: 3, settledAt: new Date() }),
        ),
      saveWithTx,
    });
    const handler = new UndoDebtPaymentHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      accounts,
      fakeTransactionWriterRepo({ deleteWithTx }),
      prisma,
    );
    const result = await handler.execute(new UndoDebtPaymentCommand("u1", "d1", KEY));
    expect(result.paidInstallments).toBe(2);
    expect(result.settledAt).toBeNull();
    expect(deleteWithTx).not.toHaveBeenCalled();
  });

  it("reverses the recorded payment's transaction and balance", async () => {
    const saveWithTx = vi.fn().mockResolvedValue(undefined);
    const deleteWithTx = vi.fn().mockResolvedValue(undefined);
    const incrementBalanceWithTx = vi.fn().mockResolvedValue(undefined);
    const paidDebt = Debt.fromPersistence({
      ...makeDebt({ totalInstallments: 3, paidInstallments: 2 }).snapshot(),
      lastPaymentTransactionId: "tx1",
      lastPaymentAccountId: "acc1",
      lastPaymentAmount: "400.0000",
    });
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi.fn().mockResolvedValue(paidDebt),
      saveWithTx,
    });
    const handler = new UndoDebtPaymentHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      fakeBankAccountRepo({ findById: vi.fn().mockResolvedValue(account), incrementBalanceWithTx }),
      fakeTransactionWriterRepo({ deleteWithTx }),
      prisma,
    );
    await handler.execute(new UndoDebtPaymentCommand("u1", "d1", KEY));
    expect(deleteWithTx).toHaveBeenCalledWith(expect.anything(), "tx1");
    // YOU_OWE's payment was an EXPENSE — reversing it restores the balance.
    expect(incrementBalanceWithTx).toHaveBeenCalledWith(expect.anything(), "acc1", "400.0000");
  });
});
