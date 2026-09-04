import { describe, expect, it } from "vitest";

import { Debt } from "../../../../../src/domains/debt/domain/debt.aggregate";
import {
  AllInstallmentsPaidError,
  DebtAlreadySettledError,
  DebtNotSettledError,
  NoPaymentsToUndoError,
  TotalInstallmentsBelowPaidError,
} from "../../../../../src/domains/debt/domain/errors";

function makeDebt(overrides: Partial<Parameters<typeof Debt.fromPersistence>[0]> = {}) {
  return Debt.fromPersistence({
    id: "d1",
    userId: "u1",
    direction: "YOU_OWE",
    counterparty: "Acme Corp",
    principal: "1240.5",
    currency: "USD",
    openedAt: new Date("2026-01-01T00:00:00Z"),
    dueAt: new Date("2026-03-01T00:00:00Z"),
    interestApr: "5.25",
    notes: null,
    settledAt: null,
    totalInstallments: 3,
    paidInstallments: 0,
    installmentAmount: null,
    frequency: "MONTHLY",
    frequencyInterval: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  });
}

describe("Debt.planCreation", () => {
  it("plans a brand-new debt with settledAt/paidInstallments reset", () => {
    const planned = Debt.planCreation({
      direction: "YOU_OWE",
      counterparty: "Acme Corp",
      principal: "1240.5",
      currency: "USD",
      openedAt: new Date("2026-01-01T00:00:00Z"),
      totalInstallments: 1,
      frequency: "MONTHLY",
      frequencyInterval: 1,
    });
    expect(planned.settledAt).toBeNull();
    expect(planned.paidInstallments).toBe(0);
    expect(planned.dueAt).toBeNull();
    expect(planned.notes).toBeNull();
  });
});

describe("Debt.toContract", () => {
  it("maps money as fixed decimal strings and dates as ISO", () => {
    const debt = makeDebt();
    expect(debt.toContract()).toEqual({
      id: "d1",
      direction: "YOU_OWE",
      counterparty: "Acme Corp",
      principal: "1240.5000",
      currency: "USD",
      openedAt: "2026-01-01T00:00:00.000Z",
      dueAt: "2026-03-01T00:00:00.000Z",
      interestApr: "5.2500",
      notes: null,
      settledAt: null,
      totalInstallments: 3,
      paidInstallments: 0,
      installmentAmount: null,
      frequency: "MONTHLY",
      frequencyInterval: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });
});

describe("Debt.applyUpdate", () => {
  it("patches only the provided scalar fields", () => {
    const debt = makeDebt();
    debt.applyUpdate({ counterparty: "New name", notes: "note" });
    expect(debt.toContract().counterparty).toBe("New name");
    expect(debt.toContract().notes).toBe("note");
    expect(debt.toContract().principal).toBe("1240.5000");
  });

  // T047: a schedule can shrink, but never past what already happened —
  // otherwise `paidInstallments > totalInstallments` becomes representable.
  it("throws TotalInstallmentsBelowPaidError when the new total is below what's already paid", () => {
    const debt = makeDebt({ totalInstallments: 12, paidInstallments: 5 });
    expect(() => debt.applyUpdate({ totalInstallments: 4 })).toThrow(
      TotalInstallmentsBelowPaidError,
    );
  });

  it("allows a new total that still covers what's already paid", () => {
    const debt = makeDebt({ totalInstallments: 12, paidInstallments: 5 });
    debt.applyUpdate({ totalInstallments: 5 });
    expect(debt.totalInstallments).toBe(5);
  });
});

describe("Debt.settle", () => {
  // T045: replaces the old "no guard against re-settling" behavior — a
  // reservation-based retry no longer needs it, and re-settling silently was
  // itself a bug: a legitimate second click on an already-settled debt used
  // to move settledAt to a fresh timestamp every time.
  it("marks a not-yet-settled debt settled", () => {
    const debt = makeDebt();
    debt.settle();
    expect(debt.settledAt).not.toBeNull();
  });

  it("throws DebtAlreadySettledError on a debt that is already settled", () => {
    const debt = makeDebt({ settledAt: new Date("2026-02-01T00:00:00Z") });
    expect(() => debt.settle()).toThrow(DebtAlreadySettledError);
  });

  it("does not move settledAt when called again on an already-settled debt", () => {
    const settledAt = new Date("2026-02-01T00:00:00Z");
    const debt = makeDebt({ settledAt });
    expect(() => debt.settle()).toThrow(DebtAlreadySettledError);
    expect(debt.settledAt).toEqual(settledAt);
  });
});

describe("Debt.unsettle", () => {
  it("throws DebtNotSettledError when not settled", () => {
    const debt = makeDebt();
    expect(() => debt.unsettle()).toThrow(DebtNotSettledError);
  });

  it("clears settledAt when settled", () => {
    const debt = makeDebt({ settledAt: new Date("2026-02-01T00:00:00Z") });
    debt.unsettle();
    expect(debt.settledAt).toBeNull();
  });
});

describe("Debt.registerPayment", () => {
  it("throws DebtAlreadySettledError when already settled", () => {
    const debt = makeDebt({ settledAt: new Date("2026-02-01T00:00:00Z") });
    expect(() => debt.registerPayment()).toThrow(DebtAlreadySettledError);
  });

  it("throws AllInstallmentsPaidError once the schedule is complete", () => {
    const debt = makeDebt({ totalInstallments: 2, paidInstallments: 2 });
    expect(() => debt.registerPayment()).toThrow(AllInstallmentsPaidError);
  });

  it("increments paidInstallments without settling before the last one", () => {
    const debt = makeDebt({ totalInstallments: 3, paidInstallments: 0 });
    debt.registerPayment();
    expect(debt.paidInstallments).toBe(1);
    expect(debt.settledAt).toBeNull();
  });

  it("auto-settles when the last installment is registered", () => {
    const debt = makeDebt({ totalInstallments: 3, paidInstallments: 2 });
    debt.registerPayment();
    expect(debt.paidInstallments).toBe(3);
    expect(debt.settledAt).not.toBeNull();
  });
});

describe("Debt.undoPayment", () => {
  it("throws NoPaymentsToUndoError when nothing was paid", () => {
    const debt = makeDebt({ paidInstallments: 0 });
    expect(() => debt.undoPayment()).toThrow(NoPaymentsToUndoError);
  });

  it("decrements paidInstallments", () => {
    const debt = makeDebt({ totalInstallments: 3, paidInstallments: 2 });
    debt.undoPayment();
    expect(debt.paidInstallments).toBe(1);
  });

  it("clears settledAt when undoing the payment that had settled it", () => {
    const debt = makeDebt({
      totalInstallments: 3,
      paidInstallments: 3,
      settledAt: new Date("2026-03-01T00:00:00Z"),
    });
    debt.undoPayment();
    expect(debt.paidInstallments).toBe(2);
    expect(debt.settledAt).toBeNull();
  });

  // T046: a debt settled MANUALLY (settle(), not by completing the schedule)
  // is a fact of its own — undoing an unrelated instalment payment must not
  // touch it. Before this fix, undoPayment() cleared settledAt whenever it
  // was non-null, regardless of whether THIS payment was the one that set it.
  it("does NOT clear settledAt when undoing a payment on a debt settled manually while not fully paid", () => {
    const settledAt = new Date("2026-03-01T00:00:00Z");
    const debt = makeDebt({
      totalInstallments: 5,
      paidInstallments: 2,
      settledAt, // settled by hand, e.g. "the counterparty forgave the rest"
    });
    debt.undoPayment();
    expect(debt.paidInstallments).toBe(1);
    expect(debt.settledAt).toEqual(settledAt);
  });
});
