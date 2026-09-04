import { describe, expect, it, vi } from "vitest";

import { SettleDebtHandler } from "../../../../../../src/domains/debt/application/commands/settle-debt.handler";
import { SettleDebtCommand } from "../../../../../../src/domains/debt/application/commands/settle-debt.command";
import { UnsettleDebtHandler } from "../../../../../../src/domains/debt/application/commands/unsettle-debt.handler";
import { UnsettleDebtCommand } from "../../../../../../src/domains/debt/application/commands/unsettle-debt.command";
import { Debt } from "../../../../../../src/domains/debt/domain/debt.aggregate";
import {
  DebtAlreadySettledError,
  DebtNotFoundError,
  DebtNotSettledError,
} from "../../../../../../src/domains/debt/domain/errors";
import type { DebtRepositoryPort } from "../../../../../../src/domains/debt/domain/ports/debt.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";
import { fakeIdempotencyRecordRepo, fakePrismaTransaction } from "../../../../support/fake-ports";

const KEY = "test-key-0000000000001";
const prisma = fakePrismaTransaction() as unknown as PrismaService;

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
  it("throws DebtNotFoundError when the debt is not the user's", async () => {
    const repo = fakeRepo({ findOneForUpdateWithTx: vi.fn().mockResolvedValue(null) });
    const handler = new SettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      prisma,
    );
    await expect(handler.execute(new SettleDebtCommand("u1", "ghost", KEY))).rejects.toBeInstanceOf(
      DebtNotFoundError,
    );
  });

  it("settles a not-yet-settled debt", async () => {
    const saveWithTx = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi.fn().mockResolvedValue(makeDebt(null)),
      saveWithTx,
    });
    const handler = new SettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      prisma,
    );
    await expect(handler.execute(new SettleDebtCommand("u1", "d1", KEY))).resolves.toBeUndefined();
    expect(saveWithTx).toHaveBeenCalled();
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
      prisma,
    );
    await expect(handler.execute(new SettleDebtCommand("u1", "d1", KEY))).rejects.toBeInstanceOf(
      DebtAlreadySettledError,
    );
  });
});

describe("UnsettleDebtHandler", () => {
  it("throws DebtNotFoundError when the debt is not the user's", async () => {
    const repo = fakeRepo({ findOneForUpdateWithTx: vi.fn().mockResolvedValue(null) });
    const handler = new UnsettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
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
      prisma,
    );
    await expect(handler.execute(new UnsettleDebtCommand("u1", "d1", KEY))).rejects.toBeInstanceOf(
      DebtNotSettledError,
    );
  });

  it("clears settledAt and persists it", async () => {
    const saveWithTx = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({
      findOneForUpdateWithTx: vi.fn().mockResolvedValue(makeDebt(new Date())),
      saveWithTx,
    });
    const handler = new UnsettleDebtHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      prisma,
    );
    const result = await handler.execute(new UnsettleDebtCommand("u1", "d1", KEY));
    expect(result.settledAt).toBeNull();
    expect(saveWithTx).toHaveBeenCalled();
  });
});
