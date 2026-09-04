import { describe, expect, it, vi } from "vitest";

import { CreateSavingsEntryHandler } from "../../../../../../src/domains/savings-entry/application/commands/create-savings-entry.handler";
import { CreateSavingsEntryCommand } from "../../../../../../src/domains/savings-entry/application/commands/create-savings-entry.command";
import { SavingsEntry } from "../../../../../../src/domains/savings-entry/domain/savings-entry.aggregate";
import type { SavingsEntryRepositoryPort } from "../../../../../../src/domains/savings-entry/domain/ports/savings-entry.repository.port";
import { SavingsGoal } from "../../../../../../src/domains/savings-goal/domain/savings-goal.aggregate";
import { SavingsGoalNotFoundError } from "../../../../../../src/domains/savings-goal/domain/errors";
import type { SavingsGoalRepositoryPort } from "../../../../../../src/domains/savings-goal/domain/ports/savings-goal.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";
import { fakeIdempotencyRecordRepo, fakePrismaTransaction } from "../../../../support/fake-ports";

const KEY = "test-key-0000000000002";
const prisma = fakePrismaTransaction() as unknown as PrismaService;

function fakeRepo(overrides: Partial<SavingsEntryRepositoryPort> = {}): SavingsEntryRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    createWithTx: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

function fakeGoals(overrides: Partial<SavingsGoalRepositoryPort> = {}): SavingsGoalRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

function makeGoal() {
  return SavingsGoal.fromPersistence({
    id: "g1",
    userId: "u1",
    title: "Vacaciones",
    targetAmount: "1000",
    currency: "USD",
    deadline: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("CreateSavingsEntryHandler", () => {
  it("converts contributedAt to a Date and persists via the repository", async () => {
    const createWithTx = vi.fn().mockImplementation(async (_tx: unknown, userId: string, plan) =>
      SavingsEntry.fromPersistence({
        id: "e1",
        userId,
        ...plan,
        createdAt: new Date("2026-02-01T00:00:00Z"),
      }),
    );
    const repo = fakeRepo({ createWithTx });
    const handler = new CreateSavingsEntryHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      fakeGoals(),
      prisma,
    );

    const result = await handler.execute(
      new CreateSavingsEntryCommand(
        "u1",
        { amount: "250", currency: "USD", contributedAt: "2026-02-01T00:00:00.000Z" },
        KEY,
      ),
    );

    expect(result.id).toBe("e1");
    expect(result.amount).toBe("250.0000");
    expect(createWithTx.mock.calls[0]![2].contributedAt).toBeInstanceOf(Date);
    expect(createWithTx.mock.calls[0]![2].savingsGoalId).toBeNull();
  });

  it("throws SavingsGoalNotFoundError when savingsGoalId isn't the caller's", async () => {
    const repo = fakeRepo();
    const goals = fakeGoals({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new CreateSavingsEntryHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      repo,
      goals,
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
          },
          KEY,
        ),
      ),
    ).rejects.toBeInstanceOf(SavingsGoalNotFoundError);
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
    const repo = fakeRepo({ createWithTx });
    const goals = fakeGoals({ findOne: vi.fn().mockResolvedValue(makeGoal()) });
    const records = fakeIdempotencyRecordRepo();
    const handler = new CreateSavingsEntryHandler(
      { publish: vi.fn() } as never,
      records,
      repo,
      goals,
      prisma,
    );
    const command = new CreateSavingsEntryCommand(
      "u1",
      {
        savingsGoalId: "g1",
        amount: "250",
        currency: "USD",
        contributedAt: "2026-02-01T00:00:00.000Z",
      },
      KEY,
    );

    const first = await handler.execute(command);
    const second = await handler.execute(command);

    expect(second).toEqual(first);
    expect(createWithTx).toHaveBeenCalledTimes(1);
  });
});
