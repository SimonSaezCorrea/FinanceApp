import { describe, expect, it } from "vitest";

import { ImportBatch } from "../../../../../src/domains/import/domain/import-batch";

describe("ImportBatch.planCreation", () => {
  it("parses occurredAt to a Date and defaults optional fields to null", () => {
    const rows = ImportBatch.planCreation({
      rows: [
        {
          type: "INCOME",
          amount: "100.00",
          currency: "USD",
          occurredAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.occurredAt).toBeInstanceOf(Date);
    expect(rows[0]!.occurredAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(rows[0]!.category).toBeNull();
    expect(rows[0]!.description).toBeNull();
    expect(rows[0]!.bankAccountId).toBeNull();
  });

  it("plans every row in the batch, preserving order", () => {
    const rows = ImportBatch.planCreation({
      rows: [
        { type: "INCOME", amount: "100", currency: "USD", occurredAt: "2026-01-01T00:00:00.000Z" },
        {
          type: "EXPENSE",
          amount: "40.50",
          currency: "USD",
          occurredAt: "2026-01-02T00:00:00.000Z",
          category: "groceries",
          description: "supermarket",
          bankAccountId: "acc1",
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      type: "EXPENSE",
      amount: "40.50",
      category: "groceries",
      description: "supermarket",
      bankAccountId: "acc1",
    });
  });
});
