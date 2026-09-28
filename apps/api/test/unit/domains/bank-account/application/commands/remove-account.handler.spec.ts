import { describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import { AccountDeletionScopeLoader } from "../../../../../../src/domains/bank-account/application/account-deletion.loader";
import { RemoveAccountCommand } from "../../../../../../src/domains/bank-account/application/commands/remove-account.command";
import { RemoveAccountHandler } from "../../../../../../src/domains/bank-account/application/commands/remove-account.handler";
import type { BankAccount } from "../../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import {
  AccountNotFoundError,
  CashAccountRequiredError,
} from "../../../../../../src/domains/bank-account/domain/errors";
import type {
  AccountDeletionMovement,
  InstallmentPlanMovement,
} from "../../../../../../src/domains/transaction/domain/ports/transaction-writer.repository.port";
import {
  accountAggregate,
  fakeBankAccountRepo,
  fakeCreditStatementRepo,
  fakePrismaTransaction,
  fakeSavingsEntryRepo,
  fakeTransactionWriterRepo,
} from "../../../../support/fake-ports";

const NONE: accounts.RemoveAccount = {
  movements: false,
  installmentPlans: false,
  recurring: false,
  savingsEntries: false,
};
const ALL: accounts.RemoveAccount = {
  movements: true,
  installmentPlans: true,
  recurring: true,
  savingsEntries: true,
};

function setup(
  opts: {
    type?: Parameters<typeof accountAggregate>[0]["type"];
    cashCount?: number;
    found?: boolean;
    removed?: boolean;
    movements?: AccountDeletionMovement[];
    planMovements?: InstallmentPlanMovement[];
  } = {},
) {
  const others: Record<string, BankAccount> = {
    b: accountAggregate({ id: "b", type: "CHECKING" }),
    c: accountAggregate({ id: "c", type: "SIGHT" }),
  };
  const accountsRepo = fakeBankAccountRepo({
    findById: vi.fn(async (_u: string, id: string) =>
      id === "a1"
        ? opts.found === false
          ? null
          : accountAggregate({ id: "a1", type: opts.type ?? "CHECKING" })
        : (others[id] ?? null),
    ),
    countByType: vi.fn(async () => opts.cashCount ?? 2),
    removeWithTx: vi.fn(async () => opts.removed ?? true),
  });
  const transactions = fakeTransactionWriterRepo({
    listForAccountDeletion: vi.fn(async () => opts.movements ?? []),
    listForInstallmentPlan: vi.fn(async () => opts.planMovements ?? []),
  });
  const statements = fakeCreditStatementRepo();
  const plans = {
    listIdsForAccount: vi.fn(async () => (opts.planMovements ? ["p1"] : [])),
    removeWithTx: vi.fn(async () => true),
  };
  const recurring = {
    listIdsForAccount: vi.fn(async () => ["r1"]),
    removeManyWithTx: vi.fn(),
  };
  const savings = fakeSavingsEntryRepo({ listIdsForAccount: vi.fn(async () => ["s1"]) });
  const debts = {
    countForAccount: vi.fn(async () => 1),
    clearLastPaymentForAccountWithTx: vi.fn(),
  };
  const loader = new AccountDeletionScopeLoader(
    accountsRepo,
    transactions,
    statements,
    plans as never,
    recurring as never,
    savings,
    debts as never,
  );
  const handler = new RemoveAccountHandler(
    { publish: vi.fn() } as never,
    fakePrismaTransaction() as never,
    loader,
    accountsRepo,
    transactions,
    plans as never,
    recurring as never,
    savings,
    debts as never,
  );
  return { handler, accountsRepo, transactions, plans, recurring, savings, debts };
}

describe("RemoveAccountHandler", () => {
  it("refuses to delete the user's only cash account", async () => {
    const { handler, accountsRepo } = setup({ type: "CASH", cashCount: 1 });
    await expect(handler.execute(new RemoveAccountCommand("u1", "a1"))).rejects.toBeInstanceOf(
      CashAccountRequiredError,
    );
    expect(accountsRepo.removeWithTx).not.toHaveBeenCalled();
  });

  it("allows deleting a second cash account", async () => {
    const { handler, accountsRepo } = setup({ type: "CASH", cashCount: 2 });
    await handler.execute(new RemoveAccountCommand("u1", "a1"));
    expect(accountsRepo.removeWithTx).toHaveBeenCalledWith(expect.anything(), "u1", "a1");
  });

  it("answers ACCOUNT_NOT_FOUND for someone else's account", async () => {
    const { handler } = setup({ found: false });
    await expect(handler.execute(new RemoveAccountCommand("u1", "ghost"))).rejects.toBeInstanceOf(
      AccountNotFoundError,
    );
  });

  it("deletes only the account when nothing else is chosen", async () => {
    const { handler, accountsRepo, transactions, recurring, savings, debts } = setup({
      movements: [
        {
          id: "t1",
          bankAccountId: "b",
          type: "INCOME",
          amount: "50000",
          currency: "CLP",
          transfer: true,
        },
      ],
    });
    await handler.execute(new RemoveAccountCommand("u1", "a1", NONE));
    expect(accountsRepo.removeWithTx).toHaveBeenCalled();
    expect(transactions.deleteManyWithTx).toHaveBeenCalledWith(expect.anything(), []);
    expect(accountsRepo.incrementBalanceWithTx).not.toHaveBeenCalled();
    expect(recurring.removeManyWithTx).not.toHaveBeenCalled();
    expect(savings.removeManyWithTx).not.toHaveBeenCalled();
    // A debt's last payment on this account is forgotten either way.
    expect(debts.clearLastPaymentForAccountWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "a1",
    );
  });

  it("with its movements, gives the other accounts their money back", async () => {
    const { handler, accountsRepo, transactions } = setup({
      movements: [
        {
          id: "own",
          bankAccountId: "a1",
          type: "EXPENSE",
          amount: "9000",
          currency: "CLP",
          transfer: false,
        },
        // The destination leg of a transfer out of a1: b loses what it received.
        {
          id: "leg",
          bankAccountId: "b",
          type: "INCOME",
          amount: "50000",
          currency: "CLP",
          transfer: true,
        },
        // A statement payment c made into a1's period: c gets it back.
        {
          id: "pay",
          bankAccountId: "c",
          type: "EXPENSE",
          amount: "120000",
          currency: "CLP",
          transfer: false,
        },
      ],
    });
    await handler.execute(new RemoveAccountCommand("u1", "a1", { ...NONE, movements: true }));
    expect(transactions.deleteManyWithTx).toHaveBeenCalledWith(expect.anything(), [
      "own",
      "leg",
      "pay",
    ]);
    expect(accountsRepo.incrementBalanceWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "b",
      "-50000.0000",
    );
    expect(accountsRepo.incrementBalanceWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "c",
      "120000.0000",
    );
    expect(accountsRepo.incrementBalanceWithTx).toHaveBeenCalledTimes(2);
  });

  it("with its plans, undoes them like deleting each plan", async () => {
    const { handler, accountsRepo, transactions, plans } = setup({
      planMovements: [
        { id: "inst", bankAccountId: "b", type: "EXPENSE", amount: "30000", financeCharge: false },
      ],
    });
    await handler.execute(
      new RemoveAccountCommand("u1", "a1", { ...NONE, installmentPlans: true }),
    );
    expect(transactions.deleteManyWithTx).toHaveBeenCalledWith(expect.anything(), ["inst"]);
    expect(accountsRepo.incrementBalanceWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "b",
      "30000.0000",
    );
    expect(plans.removeWithTx).toHaveBeenCalledWith(expect.anything(), "u1", "p1");
  });

  it("with recurring series and savings contributions, removes them", async () => {
    const { handler, recurring, savings } = setup();
    await handler.execute(new RemoveAccountCommand("u1", "a1", ALL));
    expect(recurring.removeManyWithTx).toHaveBeenCalledWith(expect.anything(), "u1", ["r1"]);
    expect(savings.removeManyWithTx).toHaveBeenCalledWith(expect.anything(), "u1", ["s1"]);
  });

  it("gives nothing back when a concurrent delete already took the account", async () => {
    const { handler, accountsRepo } = setup({
      removed: false,
      movements: [
        {
          id: "leg",
          bankAccountId: "b",
          type: "INCOME",
          amount: "50000",
          currency: "CLP",
          transfer: true,
        },
      ],
    });
    await expect(handler.execute(new RemoveAccountCommand("u1", "a1", ALL))).rejects.toBeInstanceOf(
      AccountNotFoundError,
    );
    expect(accountsRepo.incrementBalanceWithTx).not.toHaveBeenCalled();
  });
});
