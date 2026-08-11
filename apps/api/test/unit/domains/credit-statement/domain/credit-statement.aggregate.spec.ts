import { describe, expect, it } from "vitest";

import {
  CreditStatement,
  type CreditStatementProps,
} from "../../../../../src/domains/credit-statement/domain/credit-statement.aggregate";
import {
  InvalidPaymentAmountError,
  PaymentExceedsRemainingError,
  StatementAlreadyPaidError,
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
    const event = statement.payTowards("1000", "1000", "acc_2", "tx_1", new Date("2026-02-05"));
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

  describe("partial payments", () => {
    it("a payment below the total leaves the period PARTIALLY_PAID and still payable", () => {
      const statement = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );
      statement.payTowards("1000", "400", "acc_2", "tx_1", new Date("2026-02-05"));

      expect(statement.state.name).toBe("PARTIALLY_PAID");
      expect(statement.paidAmount).toBe("400.0000");
      expect(statement.remainingFor("1000")).toBe("600.0000");
      // Not settled: no date stamped, so nothing is frozen yet.
      expect(statement.paidAt).toBeNull();
      expect(statement.state.canPay()).toBe(true);
    });

    it("successive payments accumulate until the period is settled", () => {
      const statement = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );
      statement.payTowards("1000", "400", "acc_2", "tx_1", new Date("2026-02-05"));
      statement.payTowards("1000", "600", "acc_2", "tx_2", new Date("2026-02-20"));

      expect(statement.state.name).toBe("PAID");
      expect(statement.paidAmount).toBe("1000.0000");
      expect(statement.remainingFor("1000")).toBe("0.0000");
      // Only now does the total freeze — and the LAST payment is the one recorded.
      expect(statement.amount).toBe("1000.0000");
      expect(statement.paidTransactionId).toBe("tx_2");
    });

    it("rejects paying more than what is still owed, instead of capping it", () => {
      const statement = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );
      statement.payTowards("1000", "700", "acc_2", "tx_1", new Date("2026-02-05"));

      expect(() =>
        statement.payTowards("1000", "400", "acc_2", "tx_2", new Date("2026-02-20")),
      ).toThrow(PaymentExceedsRemainingError);
      // The rejected payment left nothing behind.
      expect(statement.paidAmount).toBe("700.0000");
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

    it("syncing a partially paid period leaves what was already paid alone", () => {
      const statement = CreditStatement.fromPersistence(
        baseProps({ closedAt: new Date("2026-02-01") }),
      );
      statement.payTowards("1000", "400", "acc_2", "tx_1", new Date("2026-02-05"));

      const { paidDelta } = statement.syncAmount("900");

      // Not settled, so there is no payment movement to bring in line: only the
      // period's own figure moves, and the balance owed follows from it.
      expect(paidDelta).toBe("0.0000");
      expect(statement.paidAmount).toBe("400.0000");
      expect(statement.remainingFor("900")).toBe("500.0000");
      expect(statement.state.name).toBe("PARTIALLY_PAID");
    });
  });
});
