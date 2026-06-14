import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { InvestmentsService } from "./investments.service";
import type { InvestmentsRepository } from "./investments.repository";

const etfRow = {
  id: "i1",
  userId: "u1",
  kind: "ETF",
  label: "Vanguard S&P 500",
  currency: "USD",
  symbol: "VOO",
  shares: { toString: () => "12.34567890" },
  annualRate: null,
  principal: null,
  bankAccountId: null,
  openedAt: new Date("2026-01-01T00:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

function makeService(repo: Partial<InvestmentsRepository>) {
  return new InvestmentsService(repo as InvestmentsRepository);
}

describe("InvestmentsService", () => {
  it("maps an ETF row to the contract with raw string shares (no scale forcing)", async () => {
    const svc = makeService({ list: vi.fn().mockResolvedValue([etfRow]) });
    const [inv] = await svc.list("u1");
    expect(inv).toEqual({
      id: "i1",
      kind: "ETF",
      label: "Vanguard S&P 500",
      currency: "USD",
      symbol: "VOO",
      shares: "12.34567890",
      annualRate: null,
      principal: null,
      bankAccountId: null,
      openedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("throws NotFound when getting a missing investment", async () => {
    const svc = makeService({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(svc.get("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("passes annualRate through on create for a REMUNERATED_ACCOUNT", async () => {
    const remRow = {
      ...etfRow,
      kind: "REMUNERATED_ACCOUNT",
      symbol: null,
      shares: null,
      annualRate: { toString: () => "0.045000" },
      principal: { toString: () => "10000.0000" },
    };
    const create = vi.fn().mockResolvedValue(remRow);
    const svc = makeService({ create });
    const inv = await svc.create("u1", {
      kind: "REMUNERATED_ACCOUNT",
      label: "High Yield Savings",
      currency: "USD",
      annualRate: "0.045",
      principal: "10000",
    });
    expect(create.mock.calls[0]![1]).toMatchObject({ annualRate: "0.045" });
    expect(inv.annualRate).toBe("0.045000");
  });
});
