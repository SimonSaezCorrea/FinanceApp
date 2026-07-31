import { describe, expect, it, vi } from "vitest";

import { RemoveInvestmentHandler } from "../../../../../../src/domains/investment/application/commands/remove-investment.handler";
import { RemoveInvestmentCommand } from "../../../../../../src/domains/investment/application/commands/remove-investment.command";
import { InvestmentNotFoundError } from "../../../../../../src/domains/investment/domain/errors";
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

describe("RemoveInvestmentHandler", () => {
  it("throws InvestmentNotFoundError when the repository found nothing to delete", async () => {
    const repo = fakeRepo({ remove: vi.fn().mockResolvedValue(false) });
    const handler = new RemoveInvestmentHandler({ publish: vi.fn() } as never, repo);
    await expect(
      handler.execute(new RemoveInvestmentCommand("u1", "ghost")),
    ).rejects.toBeInstanceOf(InvestmentNotFoundError);
  });

  it("removes the investment scoped to the user", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({ remove });
    const handler = new RemoveInvestmentHandler({ publish: vi.fn() } as never, repo);
    await handler.execute(new RemoveInvestmentCommand("u1", "i1"));
    expect(remove).toHaveBeenCalledWith("u1", "i1");
  });
});
