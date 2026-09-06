import { EventBus } from "@nestjs/cqrs";
import { describe, expect, it, vi } from "vitest";

import { CreateTransferCommand } from "../../../../../src/domains/transaction/application/commands/create-transfer.command";
import { CreateTransferHandler } from "../../../../../src/domains/transaction/application/commands/create-transfer.handler";
import { RemoveTransferCommand } from "../../../../../src/domains/transaction/application/commands/remove-transfer.command";
import { RemoveTransferHandler } from "../../../../../src/domains/transaction/application/commands/remove-transfer.handler";
import { UpdateTransferCommand } from "../../../../../src/domains/transaction/application/commands/update-transfer.command";
import {
  UpdateTransferHandler,
  netDeltas,
} from "../../../../../src/domains/transaction/application/commands/update-transfer.handler";
import type { TransactionRepositoryPort } from "../../../../../src/domains/transaction/domain/ports/transaction.repository.port";
import { Transaction } from "../../../../../src/domains/transaction/domain/transaction.aggregate";
import type { PrismaService } from "../../../../../src/infra/prisma/prisma.service";
import {
  accountAggregate,
  fakeIdempotencyRecordRepo,
  fakePrismaTransaction,
} from "../../../support/fake-ports";

const eventBus = { publish: vi.fn() } as unknown as EventBus;
const prisma = fakePrismaTransaction() as unknown as PrismaService;

/** Every scenario needs SOME key; only its stability across calls matters
 * elsewhere (see `useIdempotencyKey.test.ts` on the web side). */
function transferCmd(
  input: ConstructorParameters<typeof CreateTransferCommand>[1],
): CreateTransferCommand {
  return new CreateTransferCommand("u1", input, "test-key-0000000000001");
}

function leg(over: Partial<Parameters<typeof Transaction.fromPersistence>[0]> = {}) {
  return Transaction.fromPersistence({
    id: "t1",
    userId: "u1",
    type: "EXPENSE",
    amount: "1000",
    currency: "CLP",
    occurredAt: new Date("2026-08-01"),
    category: null,
    description: null,
    observation: null,
    emisor: null,
    receptor: null,
    lugar: null,
    bankAccountId: "a1",
    cardId: null,
    financeCharge: false,
    installmentPlanId: null,
    creditStatementId: null,
    transferGroupId: "g1",
    debtId: null,
    recurringExpenseId: null,
    createdAt: new Date("2026-08-01"),
    updatedAt: new Date("2026-08-01"),
    ...over,
  });
}

const pair = {
  transferGroupId: "g1",
  outgoing: leg(),
  incoming: leg({ id: "t2", type: "INCOME", amount: "1000", bankAccountId: "a2" }),
};

function fakeRepo(overrides: Partial<TransactionRepositoryPort> = {}): TransactionRepositoryPort {
  return {
    list: vi.fn(),
    summary: vi.fn(),
    findOne: vi.fn(),
    sumsForCard: vi.fn(async () => ({ income: "0", expense: "0" })),
    saveNew: vi.fn(),
    saveNewWithTx: vi.fn(),
    saveUpdate: vi.fn(),
    removeWithCreditAdjustment: vi.fn(async () => true),
    findTransferGroup: vi.fn(async () => pair),
    saveTransferPair: vi.fn(async () => pair),
    saveTransferPairWithTx: vi.fn(async () => pair),
    updateTransferPair: vi.fn(async () => pair),
    removeTransferPair: vi.fn(async () => true),
    ...overrides,
  } as TransactionRepositoryPort;
}

function fakeAccounts(types: Record<string, "CHECKING" | "SAVINGS" | "CREDIT_CARD">) {
  return {
    findById: vi.fn(async (_userId: string, id: string) =>
      types[id] ? accountAggregate({ id, type: types[id] }) : null,
    ),
  } as never;
}

const input = {
  fromBankAccountId: "a1",
  toBankAccountId: "a2",
  amountOut: "1000",
  amountIn: "1000",
  currencyOut: "CLP",
  currencyIn: "CLP",
  occurredAt: "2026-08-01T00:00:00.000Z",
};

describe("CreateTransferHandler", () => {
  it("writes both legs with one shared group id, no card and no statement", async () => {
    const repo = fakeRepo();
    const handler = new CreateTransferHandler(
      eventBus,
      fakeIdempotencyRecordRepo(),
      repo,
      fakeAccounts({ a1: "CHECKING", a2: "SAVINGS" }),
      prisma,
    );

    await handler.execute(transferCmd(input));

    const call = vi.mocked(repo.saveTransferPairWithTx).mock.calls[0]!;
    const [, , outgoing, incoming, deltas] = call;
    expect(outgoing.type).toBe("EXPENSE");
    expect(incoming.type).toBe("INCOME");
    expect(outgoing.transferGroupId).toBe(incoming.transferGroupId);
    expect(outgoing.cardId).toBeNull();
    expect(outgoing.creditStatementId).toBeNull();
    expect(deltas).toEqual([
      { accountId: "a1", delta: "-1000.0000" },
      { accountId: "a2", delta: "1000" },
    ]);
  });

  it("refuses a destination that is a credit line", async () => {
    const handler = new CreateTransferHandler(
      eventBus,
      fakeIdempotencyRecordRepo(),
      fakeRepo(),
      fakeAccounts({ a1: "CHECKING", a2: "CREDIT_CARD" }),
      prisma,
    );
    await expect(handler.execute(transferCmd(input))).rejects.toThrow(/TRANSFER_TO_CREDIT_ACCOUNT/);
  });

  it("refuses an account that isn't the user's", async () => {
    const handler = new CreateTransferHandler(
      eventBus,
      fakeIdempotencyRecordRepo(),
      fakeRepo(),
      fakeAccounts({ a1: "CHECKING" }),
      prisma,
    );
    await expect(handler.execute(transferCmd(input))).rejects.toThrow(/TRANSFER_ACCOUNT_NOT_FOUND/);
  });
});

describe("UpdateTransferHandler", () => {
  it("reverts the old legs and applies the new ones when the destination changes", async () => {
    const repo = fakeRepo();
    const handler = new UpdateTransferHandler(
      eventBus,
      repo,
      fakeAccounts({ a1: "CHECKING", a3: "SAVINGS" }),
    );

    await handler.execute(
      new UpdateTransferCommand("u1", "g1", { toBankAccountId: "a3", amountIn: "1000" }),
    );

    const deltas = vi.mocked(repo.updateTransferPair).mock.calls[0]![4];
    // a1 is unchanged (−1000 reverted, −1000 reapplied ⇒ 0), a2 gives the money
    // back and a3 receives it.
    expect(deltas).toEqual(
      expect.arrayContaining([
        { accountId: "a1", delta: "0.0000" },
        { accountId: "a2", delta: "-1000.0000" },
        { accountId: "a3", delta: "1000.0000" },
      ]),
    );
  });

  it("404s on a group that doesn't exist", async () => {
    const handler = new UpdateTransferHandler(
      eventBus,
      fakeRepo({ findTransferGroup: vi.fn(async () => null) }),
      fakeAccounts({}),
    );
    await expect(
      handler.execute(new UpdateTransferCommand("u1", "nope", { amountOut: "5" })),
    ).rejects.toThrow(/TRANSFER_NOT_FOUND/);
  });
});

describe("RemoveTransferHandler", () => {
  it("gives both accounts their money back", async () => {
    const repo = fakeRepo();
    const handler = new RemoveTransferHandler(eventBus, repo);

    await handler.execute(new RemoveTransferCommand("u1", "g1"));

    expect(vi.mocked(repo.removeTransferPair).mock.calls[0]![2]).toEqual([
      { accountId: "a1", delta: "1000.0000" },
      { accountId: "a2", delta: "-1000.0000" },
    ]);
  });
});

describe("netDeltas", () => {
  it("collapses several deltas on the same account", () => {
    expect(
      netDeltas([
        { accountId: "a", delta: "5" },
        { accountId: "a", delta: "-2" },
      ]),
    ).toEqual([{ accountId: "a", delta: "3.0000" }]);
  });
});
