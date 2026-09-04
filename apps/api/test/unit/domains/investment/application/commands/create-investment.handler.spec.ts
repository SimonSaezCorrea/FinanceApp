import { describe, expect, it, vi } from "vitest";

import type { BankAccountLookupPort } from "../../../../../../src/domains/bank-account/domain/ports/bank-account-lookup.port";
import { CreateInvestmentHandler } from "../../../../../../src/domains/investment/application/commands/create-investment.handler";
import { CreateInvestmentCommand } from "../../../../../../src/domains/investment/application/commands/create-investment.command";
import { Investment } from "../../../../../../src/domains/investment/domain/investment.aggregate";
import type { InvestmentRepositoryPort } from "../../../../../../src/domains/investment/domain/ports/investment.repository.port";

function fakeRepo(overrides: Partial<InvestmentRepositoryPort> = {}): InvestmentRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

function fakeAccounts(overrides: Partial<BankAccountLookupPort> = {}): BankAccountLookupPort {
  return {
    accountOwned: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("CreateInvestmentHandler", () => {
  it("plans the investment and persists it via the repository", async () => {
    const create = vi.fn().mockImplementation(async (userId: string, plan) =>
      Investment.fromPersistence({
        id: "i1",
        userId,
        ...plan,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    const repo = fakeRepo({ create });
    const handler = new CreateInvestmentHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeAccounts(),
    );

    const result = await handler.execute(
      new CreateInvestmentCommand("u1", {
        kind: "ETF",
        label: "Vanguard S&P 500",
        currency: "USD",
        symbol: "VOO",
        shares: "12.34567890",
      }),
    );

    expect(result.id).toBe("i1");
    expect(result.label).toBe("Vanguard S&P 500");
    expect(result.shares).toBe("12.34567890");
    expect(create).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ label: "Vanguard S&P 500" }),
    );
  });

  it("passes annualRate/principal through on create for a REMUNERATED_ACCOUNT", async () => {
    const create = vi.fn().mockImplementation(async (userId: string, plan) =>
      Investment.fromPersistence({
        id: "i2",
        userId,
        ...plan,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    const repo = fakeRepo({ create });
    const handler = new CreateInvestmentHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeAccounts(),
    );

    const result = await handler.execute(
      new CreateInvestmentCommand("u1", {
        kind: "REMUNERATED_ACCOUNT",
        label: "High Yield Savings",
        currency: "USD",
        annualRate: "0.045",
        principal: "10000",
      }),
    );

    expect(create.mock.calls[0]![1]).toMatchObject({ annualRate: "0.045", principal: "10000" });
    expect(result.annualRate).toBe("0.045");
  });
});
