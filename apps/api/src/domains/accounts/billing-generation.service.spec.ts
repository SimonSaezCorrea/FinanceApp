import { describe, expect, it, vi } from "vitest";

import { BillingGenerationService } from "./billing-generation.service";
import type { AccountsRepository } from "./accounts.repository";

function makeService(repo: Partial<AccountsRepository>) {
  return new BillingGenerationService(repo as AccountsRepository);
}

const creditLineAccount = {
  id: "aC",
  type: "CREDIT_LINE" as const,
  status: "ACTIVE" as const,
  billingSettings: { billingCycleDay: 15 },
  cards: [{ kind: "CREDIT" as const, isPrimary: true, isActive: true }],
};

describe("BillingGenerationService", () => {
  it("does nothing when there's no billing day configured", async () => {
    const closeStatement = vi.fn();
    const svc = makeService({
      findOne: vi.fn().mockResolvedValue({ ...creditLineAccount, billingSettings: { billingCycleDay: null } }),
      findOpenStatement: vi.fn(),
      closeStatement,
    });
    const closed = await svc.generateForAccount("u1", "aC");
    expect(closed).toBe(false);
    expect(closeStatement).not.toHaveBeenCalled();
  });

  it("does nothing when there's no OPEN statement (no usage since last close)", async () => {
    const closeStatement = vi.fn();
    const svc = makeService({
      findOne: vi.fn().mockResolvedValue(creditLineAccount),
      findOpenStatement: vi.fn().mockResolvedValue(null),
      closeStatement,
    });
    const closed = await svc.generateForAccount("u1", "aC");
    expect(closed).toBe(false);
    expect(closeStatement).not.toHaveBeenCalled();
  });

  it("does nothing when the billing-cycle boundary hasn't passed yet", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T00:00:00Z"));
    const closeStatement = vi.fn();
    const svc = makeService({
      findOne: vi.fn().mockResolvedValue(creditLineAccount),
      findOpenStatement: vi.fn().mockResolvedValue({ id: "s1", periodStart: new Date("2026-07-01T00:00:00Z") }),
      closeStatement,
    });
    const closed = await svc.generateForAccount("u1", "aC");
    expect(closed).toBe(false);
    expect(closeStatement).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("closes the OPEN statement once the boundary has passed, for an eligible account", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T00:00:00Z"));
    const closeStatement = vi.fn();
    const svc = makeService({
      findOne: vi.fn().mockResolvedValue(creditLineAccount),
      findOpenStatement: vi.fn().mockResolvedValue({ id: "s1", periodStart: new Date("2026-07-01T00:00:00Z") }),
      closeStatement,
    });
    const closed = await svc.generateForAccount("u1", "aC");
    expect(closed).toBe(true);
    expect(closeStatement).toHaveBeenCalledWith("s1", new Date("2026-07-15T00:00:00Z"));
    vi.useRealTimers();
  });

  it("does not close when the account is inactive", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T00:00:00Z"));
    const closeStatement = vi.fn();
    const svc = makeService({
      findOne: vi.fn().mockResolvedValue({ ...creditLineAccount, status: "INACTIVE" as const }),
      findOpenStatement: vi.fn().mockResolvedValue({ id: "s1", periodStart: new Date("2026-07-01T00:00:00Z") }),
      closeStatement,
    });
    const closed = await svc.generateForAccount("u1", "aC");
    expect(closed).toBe(false);
    expect(closeStatement).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not close when the (only) primary credit card is inactive", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T00:00:00Z"));
    const closeStatement = vi.fn();
    const svc = makeService({
      findOne: vi.fn().mockResolvedValue({
        ...creditLineAccount,
        cards: [{ kind: "CREDIT" as const, isPrimary: true, isActive: false }],
      }),
      findOpenStatement: vi.fn().mockResolvedValue({ id: "s1", periodStart: new Date("2026-07-01T00:00:00Z") }),
      closeStatement,
    });
    const closed = await svc.generateForAccount("u1", "aC");
    expect(closed).toBe(false);
    expect(closeStatement).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("checks any active pool-sharing CREDIT card for a non-CREDIT_LINE account", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T00:00:00Z"));
    const closeStatement = vi.fn();
    const svc = makeService({
      findOne: vi.fn().mockResolvedValue({
        id: "a1",
        type: "CHECKING" as const,
        status: "ACTIVE" as const,
        billingSettings: { billingCycleDay: 15 },
        cards: [
          { kind: "DEBIT" as const, isPrimary: false, isActive: true },
          { kind: "CREDIT" as const, isPrimary: false, isActive: true },
        ],
      }),
      findOpenStatement: vi.fn().mockResolvedValue({ id: "s1", periodStart: new Date("2026-07-01T00:00:00Z") }),
      closeStatement,
    });
    const closed = await svc.generateForAccount("u1", "a1");
    expect(closed).toBe(true);
  });
});
