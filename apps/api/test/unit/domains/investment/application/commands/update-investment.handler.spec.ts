import { describe, expect, it, vi } from "vitest";

import { UpdateInvestmentHandler } from "../../../../../../src/domains/investment/application/commands/update-investment.handler";
import { UpdateInvestmentCommand } from "../../../../../../src/domains/investment/application/commands/update-investment.command";
import { Investment } from "../../../../../../src/domains/investment/domain/investment.aggregate";
import { InvestmentNotFoundError } from "../../../../../../src/domains/investment/domain/errors";
import type { InvestmentRepositoryPort } from "../../../../../../src/domains/investment/domain/ports/investment.repository.port";

function makeInvestment() {
  return Investment.fromPersistence({
    id: "i1",
    userId: "u1",
    kind: "ETF",
    label: "Vanguard S&P 500",
    currency: "USD",
    symbol: "VOO",
    shares: "10",
    annualRate: null,
    principal: null,
    bankAccountId: null,
    openedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}

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

describe("UpdateInvestmentHandler", () => {
  it("throws InvestmentNotFoundError when missing", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new UpdateInvestmentHandler({ publish: vi.fn() } as never, repo);
    await expect(
      handler.execute(new UpdateInvestmentCommand("u1", "ghost", { label: "x" })),
    ).rejects.toBeInstanceOf(InvestmentNotFoundError);
  });

  it("applies the patch and saves via the repository", async () => {
    const investment = makeInvestment();
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(investment), save });
    const handler = new UpdateInvestmentHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(
      new UpdateInvestmentCommand("u1", "i1", { label: "Renamed", symbol: "SPY" }),
    );

    expect(result.label).toBe("Renamed");
    expect(result.symbol).toBe("SPY");
    expect(save).toHaveBeenCalledWith(investment);
  });
});
