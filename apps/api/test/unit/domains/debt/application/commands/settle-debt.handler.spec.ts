import { describe, expect, it, vi } from "vitest";

import type { debts } from "@finance/contracts";

import { SettleDebtHandler } from "../../../../../../src/domains/debt/application/commands/settle-debt.handler";
import { SettleDebtCommand } from "../../../../../../src/domains/debt/application/commands/settle-debt.command";
import { UnsettleDebtHandler } from "../../../../../../src/domains/debt/application/commands/unsettle-debt.handler";
import { UnsettleDebtCommand } from "../../../../../../src/domains/debt/application/commands/unsettle-debt.command";
import { AccountNotFoundError } from "../../../../../../src/domains/bank-account/domain/errors";
import { Debt } from "../../../../../../src/domains/debt/domain/debt.aggregate";
import {
  DebtAlreadySettledError,
  DebtNotFoundError,
  DebtNotSettledError,
  DebtPaymentCurrencyMismatchError,
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

function makeDebt(settledAt: Date | null = null) {
  return Debt.fromPersistence({
    id: "d1",
    userId: "u1",
    direction: "YOU_OWE",
    counterparty: "Acme Corp",
    principal: "1240.5",
    currency: "USD",
    openedAt: new Date("2026-01-01T00:00:00Z"),
    dueAt: null,
    interestApr: null,
    notes: null,
    settledAt,
    totalInstallments: 1,
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

describe("SettleDebtHandler", () => {
  it("throws AccountNotFoundError when the account isn't the user's", async () => {
    const repo = fakeRepo();
    const noAccount = fakeBankAccountRepo({ findById: vi.fn().mockResolvedValue(null) });
    const handler = new SettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      noAccount,
      fakeTransactionWriterRepo(),
      prisma,
    );
    await expect(
      handler.execute(new SettleDebtCommand("u1", "d1", KEY, PAY)),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });

  it("throws DebtNotFoundError when the debt is not the user's", async () => {
    const repo = fakeRepo({ findOneForUpdateWithTx: vi.fn().mockResolvedValue(null) });
    const handler = new SettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );
    await expect(
      handler.execute(new SettleDebtCommand("u1", "ghost", KEY, PAY)),
    ).rejects.toBeInstanceOf(DebtNotFoundError);
  });

  it("throws DebtPaymentCurrencyMismatchError when the account's currency differs", async () => {
    const clpAccount = accountAggregate({ id: "acc2", type: "CHECKING", currency: "CLP" });
    const mismatched = fakeBankAccountRepo({ findById: vi.fn().mockResolvedValue(clpAccount) });
    const repo = fakeRepo({ findOneForUpdateWithTx: vi.fn().mockResolvedValue(makeDebt(null)) });
    const handler = new SettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      mismatched,
      fakeTransactionWriterRepo(),
      prisma,
    );
    await expect(
      handler.execute(new SettleDebtCommand("u1", "d1", KEY, { accountId: "acc2" })),
    ).rejects.toBeInstanceOf(DebtPaymentCurrencyMismatchError);
  });

  it("settles a not-yet-settled debt and records the real payment", async () => {
    const saveWithTx = vi.fn().mockResolvedValue(undefined);
    const createWithTx = vi.fn().mockResolvedValue(undefined);
    const incrementBalanceWithTx = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi.fn().mockResolvedValue(makeDebt(null)),
      saveWithTx,
    });
    const handler = new SettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      fakeBankAccountRepo({ findById: vi.fn().mockResolvedValue(account), incrementBalanceWithTx }),
      fakeTransactionWriterRepo({ createWithTx }),
      prisma,
    );
    await expect(
      handler.execute(new SettleDebtCommand("u1", "d1", KEY, PAY)),
    ).resolves.toBeUndefined();
    expect(saveWithTx).toHaveBeenCalled();
    // YOU_OWE settled: an EXPENSE for the full principal (single payment).
    expect(createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "EXPENSE", amount: "1240.5000", bankAccountId: "acc1" }),
    );
    expect(incrementBalanceWithTx).toHaveBeenCalledWith(expect.anything(), "acc1", "-1240.5000");
  });

  // Replaces the old "no guard against re-settling" behavior — see
  // Debt.settle's own tests for why re-stamping settledAt was a bug.
  it("throws DebtAlreadySettledError on an already-settled debt", async () => {
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi.fn().mockResolvedValue(makeDebt(new Date())),
    });
    const handler = new SettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );
    await expect(
      handler.execute(new SettleDebtCommand("u1", "d1", KEY, PAY)),
    ).rejects.toBeInstanceOf(DebtAlreadySettledError);
  });
});

describe("UnsettleDebtHandler", () => {
  it("throws DebtNotFoundError when the debt is not the user's", async () => {
    const repo = fakeRepo({ findOneForUpdateWithTx: vi.fn().mockResolvedValue(null) });
    const handler = new UnsettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );
    await expect(
      handler.execute(new UnsettleDebtCommand("u1", "ghost", KEY)),
    ).rejects.toBeInstanceOf(DebtNotFoundError);
  });

  it("throws DebtNotSettledError when not currently settled", async () => {
    const repo = fakeRepo({ findOneForUpdateWithTx: vi.fn().mockResolvedValue(makeDebt(null)) });
    const handler = new UnsettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      accounts,
      fakeTransactionWriterRepo(),
      prisma,
    );
    await expect(handler.execute(new UnsettleDebtCommand("u1", "d1", KEY))).rejects.toBeInstanceOf(
      DebtNotSettledError,
    );
  });

  it("clears settledAt and persists it, with nothing to reverse for a debt with no recorded payment", async () => {
    const saveWithTx = vi.fn().mockResolvedValue(undefined);
    const deleteWithTx = vi.fn();
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi.fn().mockResolvedValue(makeDebt(new Date())),
      saveWithTx,
    });
    const handler = new UnsettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      accounts,
      fakeTransactionWriterRepo({ deleteWithTx }),
      prisma,
    );
    const result = await handler.execute(new UnsettleDebtCommand("u1", "d1", KEY));
    expect(result.settledAt).toBeNull();
    expect(saveWithTx).toHaveBeenCalled();
    expect(deleteWithTx).not.toHaveBeenCalled();
  });

  it("reverses the recorded payment's transaction and balance", async () => {
    const saveWithTx = vi.fn().mockResolvedValue(undefined);
    const deleteWithTx = vi.fn().mockResolvedValue(undefined);
    const incrementBalanceWithTx = vi.fn().mockResolvedValue(undefined);
    const settledWithPayment = Debt.fromPersistence({
      ...makeDebt(new Date()).snapshot(),
      lastPaymentTransactionId: "tx1",
      lastPaymentAccountId: "acc1",
      lastPaymentAmount: "1240.5000",
    });
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi.fn().mockResolvedValue(settledWithPayment),
      saveWithTx,
    });
    const handler = new UnsettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      fakeBankAccountRepo({ findById: vi.fn().mockResolvedValue(account), incrementBalanceWithTx }),
      fakeTransactionWriterRepo({ deleteWithTx }),
      prisma,
    );
    await handler.execute(new UnsettleDebtCommand("u1", "d1", KEY));
    expect(deleteWithTx).toHaveBeenCalledWith(expect.anything(), "tx1");
    // YOU_OWE's payment was an EXPENSE — reversing it restores the balance.
    expect(incrementBalanceWithTx).toHaveBeenCalledWith(expect.anything(), "acc1", "1240.5000");
  });
});
