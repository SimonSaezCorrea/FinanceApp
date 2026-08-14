import { describe, expect, it } from "vitest";

import {
  CreditStatement,
  type CreditStatementProps,
} from "../../../../../src/domains/credit-statement/domain/credit-statement.aggregate";
import {
  InvalidPaymentAmountError,
  PaymentExceedsRemainingError,
  StatementAlreadyPaidError,
  StatementNotPaidError,
} from "../../../../../src/domains/credit-statement/domain/errors";
import { StatementClosedEvent } from "../../../../../src/domains/credit-statement/domain/events/statement-closed.event";
import { StatementPaidEvent } from "../../../../../src/domains/credit-statement/domain/events/statement-paid.event";

function baseProps(overrides: Partial<CreditStatementProps> = {}): CreditStatementProps {
  return {
    id: "st_1",
    accountId: "acc_1",
    periodStart: new Date("2026-01-01"),
    closedAt: null,
    paidAt: null,
    amount: "1000",
    paidAmount: "0",
    carriedOverAmount: "0",
    carriedToId: null,
    paidFromAccountId: null,
    paidTransactionId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("CreditStatement aggregate (State pattern)", () => {
  it("OPEN -> PENDING via close(), emitting StatementClosedEvent", () => {
    const statement = CreditStatement.fromPersistence(baseProps());
    expect(statement.state.name).toBe("OPEN");
    const event = statement.close(new Date("2026-02-01"));
    expect(event).toBeInstanceOf(StatementClosedEvent);
    expect(statement.state.name).toBe("PENDING");
  });

  it("PENDING -> PAID via pay(), emitting StatementPaidEvent", () => {
    const statement = CreditStatement.fromPersistence(
      baseProps({ closedAt: new Date("2026-02-01") }),
    );
    const { event } = statement.payTowards("1000", "1000", "acc_2", "tx_1", new Date("2026-02-05"));
    expect(event).toBeInstanceOf(StatementPaidEvent);
    expect(statement.state.name).toBe("PAID");
    expect(statement.paidFromAccountId).toBe("acc_2");
    expect(statement.paidTransactionId).toBe("tx_1");
  });

  it("OPEN can be paid directly (early payment), closing it too", () => {
    const statement = CreditStatement.fromPersistence(baseProps());
    statement.payTowards("500", "500", "acc_2", "tx_1", new Date("2026-01-10"));
    expect(statement.state.name).toBe("PAID");
    expect(statement.closedAt).not.toBeNull();
  });

  it("rejects paying an already-PAID statement twice (the textbook State-pattern proof)", () => {
    const statement = CreditStatement.fromPersistence(baseProps());
    statement.payTowards("100", "100", "acc_1", "tx_1", new Date());
    expect(() => statement.payTowards("100", "100", "acc_1", "tx_2", new Date())).toThrow(
      StatementAlreadyPaidError,
    );
  });

  it("rejects closing an already-PAID statement", () => {
    const statement = CreditStatement.fromPersistence(baseProps());
    statement.payTowards("100", "100", "acc_1", "tx_1", new Date());
    expect(() => statement.close(new Date())).toThrow(StatementAlreadyPaidError);
  });

  describe("syncAmount (reconciling a period against its own movements)", () => {
    it("replaces an unsettled period's figure and moves nothing else", () => {
      const statement = CreditStatement.fromPersistence(baseProps({ closedAt: new Date() }));
      const { paidDelta } = statement.syncAmount("1250");

      expect(statement.amount).toBe("1250.0000");
      // Nothing was paid, so there's no payment to correct and no pool to adjust.
      expect(paidDelta).toBe("0.0000");
      expect(statement.paidAmount).toBe("0.0000");
      expect(statement.state.name).toBe("PENDING");
    });

    it("keeps a settled period settled, reporting what the payment must change by", () => {
      const statement = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );
      statement.payTowards("1000", "1000", "acc_2", "tx_1", new Date("2026-02-05"));

      // The period turned out to be worth more than what was paid for it.
      const { previousPaidAmount, paidDelta } = statement.syncAmount("1200");

      expect(statement.amount).toBe("1200.0000");
      expect(statement.paidAmount).toBe("1200.0000");
      expect(previousPaidAmount).toBe("1000.0000");
      expect(paidDelta).toBe("200.0000");
      expect(statement.state.name).toBe("PAID");
    });

    it("reports a negative delta when the period shrank", () => {
      const statement = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );
      statement.payTowards("1000", "1000", "acc_2", "tx_1", new Date("2026-02-05"));

      const { paidDelta } = statement.syncAmount("800");

      expect(statement.paidAmount).toBe("800.0000");
      expect(paidDelta).toBe("-200.0000");
      expect(statement.state.name).toBe("PAID");
    });
  });

  describe("correcting what was paid (changePaidAmount)", () => {
    const settled = () => {
      const statement = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );
      statement.payTowards("1000", "400", "acc_2", "tx_1", new Date("2026-02-05"));
      return statement;
    };

    it("moves the payment and reports what the successor must now hold", () => {
      const statement = settled();

      const { paidDelta, carryOver } = statement.changePaidAmount("700");

      expect(paidDelta).toBe("300.0000");
      expect(carryOver).toBe("300.0000");
      expect(statement.paidAmount).toBe("700.0000");
      // The period's own total is NOT touched: only sync recomputes that.
      expect(statement.amount).toBe("1000.0000");
      expect(statement.state.name).toBe("PARTIALLY_PAID");
    });

    it("correcting up to the full total makes the period PAID", () => {
      const statement = settled();

      expect(statement.changePaidAmount("1000").carryOver).toBe("0.0000");
      expect(statement.state.name).toBe("PAID");
    });

    it("rejects more than the period's total, zero, and an unsettled period", () => {
      expect(() => settled().changePaidAmount("1200")).toThrow(PaymentExceedsRemainingError);
      expect(() => settled().changePaidAmount("0")).toThrow(InvalidPaymentAmountError);
      const pending = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );
      expect(() => pending.changePaidAmount("500")).toThrow(StatementNotPaidError);
    });
  });

  describe("partial payments (the shortfall rolls into the next period)", () => {
    it("a payment below the total still SETTLES the period, reporting the leftover", () => {
      const statement = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );
      const { carryOver } = statement.payTowards(
        "1000",
        "400",
        "acc_2",
        "tx_1",
        new Date("2026-02-05"),
      );

      // Settled, but reported as PARTIALLY_PAID: the payment covered 400 of 1000.
      expect(statement.state.name).toBe("PARTIALLY_PAID");
      expect(carryOver).toBe("600.0000");
      expect(statement.paidAmount).toBe("400.0000");
      // Frozen at the period's real total, not at what was paid — the period
      // owed 1000, of which 600 is now the next period's problem.
      expect(statement.amount).toBe("1000.0000");
      expect(statement.state.canPay()).toBe(false);
    });

    it("refuses a second payment: the period is settled, the debt lives elsewhere", () => {
      const statement = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );
      statement.payTowards("1000", "400", "acc_2", "tx_1", new Date("2026-02-05"));

      expect(() =>
        statement.payTowards("1000", "600", "acc_2", "tx_2", new Date("2026-02-20")),
      ).toThrow(StatementAlreadyPaidError);
    });

    it("the receiving period owes its own movements PLUS what came forward", () => {
      const next = CreditStatement.fromPersistence(baseProps({ id: "st_2" }));
      next.receiveCarryOver("600");
      // A second period in a row can roll into the same open one.
      next.receiveCarryOver("150");

      expect(next.carriedOverAmount).toBe("750.0000");
      expect(next.totalFor("200")).toBe("950.0000");
      expect(next.remainingFor(next.totalFor("200"))).toBe("950.0000");
    });

    it("rejects paying more than the period owes, instead of capping it", () => {
      const statement = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );

      expect(() =>
        statement.payTowards("1000", "1400", "acc_2", "tx_1", new Date("2026-02-05")),
      ).toThrow(PaymentExceedsRemainingError);
      expect(statement.paidAmount).toBe("0.0000");
      expect(statement.state.name).toBe("PENDING");
    });

    it("rejects a zero or negative payment", () => {
      const statement = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );
      expect(() => statement.payTowards("1000", "0", "acc_2", "tx_1", new Date())).toThrow(
        InvalidPaymentAmountError,
      );
      expect(() => statement.payTowards("1000", "-50", "acc_2", "tx_1", new Date())).toThrow(
        InvalidPaymentAmountError,
      );
    });

    it("syncing a period settled with a shortfall moves the CARRY-OVER, not the payment", () => {
      const statement = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );
      statement.payTowards("1000", "400", "acc_2", "tx_1", new Date("2026-02-05"));
      statement.markCarriedTo("st_2");

      const { paidDelta, carryOverDelta } = statement.syncAmount("900");

      // What was paid is a historical fact; the period turned out 100 smaller, so
      // 100 less is owed downstream. The payment movement and the pool stay put.
      expect(paidDelta).toBe("0.0000");
      expect(carryOverDelta).toBe("-100.0000");
      expect(statement.paidAmount).toBe("400.0000");
      expect(statement.amount).toBe("900.0000");
      // Still short (400 of 900), so still PARTIALLY_PAID.
      expect(statement.state.name).toBe("PARTIALLY_PAID");
    });
  });
});
