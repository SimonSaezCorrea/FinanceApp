import { describe, expect, it } from "vitest";

import {
  CreditStatement,
  type CreditStatementProps,
} from "../../../../../src/domains/credit-statement/domain/credit-statement.aggregate";
import { StatementAlreadyPaidError, StatementNotPaidError } from "../../../../../src/domains/credit-statement/domain/errors";
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
    const statement = CreditStatement.fromPersistence(baseProps({ closedAt: new Date("2026-02-01") }));
    const event = statement.pay("1000", "acc_2", "tx_1", new Date("2026-02-05"));
    expect(event).toBeInstanceOf(StatementPaidEvent);
    expect(statement.state.name).toBe("PAID");
    expect(statement.paidFromAccountId).toBe("acc_2");
    expect(statement.paidTransactionId).toBe("tx_1");
  });

  it("OPEN can be paid directly (early payment), closing it too", () => {
    const statement = CreditStatement.fromPersistence(baseProps());
    statement.pay("500", "acc_2", "tx_1", new Date("2026-01-10"));
    expect(statement.state.name).toBe("PAID");
    expect(statement.closedAt).not.toBeNull();
  });

  it("rejects paying an already-PAID statement twice (the textbook State-pattern proof)", () => {
    const statement = CreditStatement.fromPersistence(baseProps());
    statement.pay("100", "acc_1", "tx_1", new Date());
    expect(() => statement.pay("100", "acc_1", "tx_2", new Date())).toThrow(StatementAlreadyPaidError);
  });

  it("rejects closing an already-PAID statement", () => {
    const statement = CreditStatement.fromPersistence(baseProps());
    statement.pay("100", "acc_1", "tx_1", new Date());
    expect(() => statement.close(new Date())).toThrow(StatementAlreadyPaidError);
  });

  it("rejects correcting an amount unless PAID", () => {
    const open = CreditStatement.fromPersistence(baseProps());
    expect(() => open.correctAmount("999")).toThrow(StatementNotPaidError);

    const pending = CreditStatement.fromPersistence(baseProps({ closedAt: new Date() }));
    expect(() => pending.correctAmount("999")).toThrow(StatementNotPaidError);

    const paid = CreditStatement.fromPersistence(
      baseProps({ closedAt: new Date(), paidAt: new Date(), amount: "1000" }),
    );
    paid.correctAmount("950");
    expect(paid.amount).toBe("950.0000");
  });
});
