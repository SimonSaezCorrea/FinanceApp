import { describe, expect, it, vi } from "vitest";

import { GetInvestmentQueryHandler } from "../../../../../../src/domains/investment/application/queries/get-investment.handler";
import { GetInvestmentQuery } from "../../../../../../src/domains/investment/application/queries/get-investment.query";
import { ListInvestmentsQueryHandler } from "../../../../../../src/domains/investment/application/queries/list-investments.handler";
import { ListInvestmentsQuery } from "../../../../../../src/domains/investment/application/queries/list-investments.query";
import { Investment } from "../../../../../../src/domains/investment/domain/investment.aggregate";
import { InvestmentNotFoundError } from "../../../../../../src/domains/investment/domain/errors";
import type { InvestmentRepositoryPort } from "../../../../../../src/domains/investment/domain/ports/investment.repository.port";

function makeInvestment(id: string) {
  return Investment.fromPersistence({
    id,
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

describe("GetInvestmentQueryHandler", () => {
  it("throws InvestmentNotFoundError when missing", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new GetInvestmentQueryHandler(repo);
    await expect(handler.execute(new GetInvestmentQuery("u1", "ghost"))).rejects.toBeInstanceOf(
      InvestmentNotFoundError,
    );
  });

  it("returns the investment as a contract", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeInvestment("i1")) });
    const handler = new GetInvestmentQueryHandler(repo);
    const result = await handler.execute(new GetInvestmentQuery("u1", "i1"));
    expect(result.id).toBe("i1");
  });
});

describe("ListInvestmentsQueryHandler", () => {
  it("lists the user's investments as contracts", async () => {
    const repo = fakeRepo({ list: vi.fn().mockResolvedValue([makeInvestment("i1"), makeInvestment("i2")]) });
    const handler = new ListInvestmentsQueryHandler(repo);
    const result = await handler.execute(new ListInvestmentsQuery("u1"));
    expect(result.map((i) => i.id)).toEqual(["i1", "i2"]);
  });
});
