import { describe, expect, it, vi } from "vitest";

import { ImportService } from "./import.service";

describe("ImportService", () => {
  it("imports rows via createMany and returns the inserted count", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const fakePrisma = { transaction: { createMany } };
    const svc = new ImportService(fakePrisma as never);

    const result = await svc.importTransactions("u1", {
      rows: [
        {
          type: "INCOME",
          amount: "100.00",
          currency: "USD",
          occurredAt: "2026-01-01T00:00:00.000Z",
        },
        {
          type: "EXPENSE",
          amount: "40.50",
          currency: "USD",
          occurredAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });

    expect(result).toEqual({ imported: 2 });
    expect(createMany).toHaveBeenCalledTimes(1);

    const { data } = createMany.mock.calls[0]![0];
    expect(data).toHaveLength(2);
    for (const item of data) {
      expect(item.userId).toBe("u1");
      expect(item.occurredAt).toBeInstanceOf(Date);
    }
  });
});
