import { describe, expect, it, vi } from "vitest";

import type { BankAccountLookupPort } from "../../../../../../src/domains/bank-account/domain/ports/bank-account-lookup.port";
import { ImportTransactionsCommand } from "../../../../../../src/domains/import/application/commands/import-transactions.command";
import { ImportTransactionsHandler } from "../../../../../../src/domains/import/application/commands/import-transactions.handler";
import type { ImportTransactionsRepositoryPort } from "../../../../../../src/domains/import/domain/ports/import-transactions.repository.port";

function fakeRepo(
  overrides: Partial<ImportTransactionsRepositoryPort> = {},
): ImportTransactionsRepositoryPort {
  return {
    importRows: vi.fn(),
    ...overrides,
  };
}

function fakeAccounts(overrides: Partial<BankAccountLookupPort> = {}): BankAccountLookupPort {
  return {
    accountOwned: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("ImportTransactionsHandler", () => {
  it("plans every row and persists the batch via the repository, returning the inserted count", async () => {
    const importRows = vi.fn().mockResolvedValue(2);
    const repo = fakeRepo({ importRows });
    const handler = new ImportTransactionsHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeAccounts(),
    );

    const result = await handler.execute(
      new ImportTransactionsCommand("u1", {
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
      }),
    );

    expect(result).toEqual({ imported: 2 });
    expect(importRows).toHaveBeenCalledTimes(1);

    const [userId, rows] = importRows.mock.calls[0]!;
    expect(userId).toBe("u1");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.occurredAt).toBeInstanceOf(Date);
    }
  });

  it("returns 0 imported when the repository inserts nothing", async () => {
    const repo = fakeRepo({ importRows: vi.fn().mockResolvedValue(0) });
    const handler = new ImportTransactionsHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeAccounts(),
    );

    const result = await handler.execute(
      new ImportTransactionsCommand("u1", {
        rows: [
          { type: "INCOME", amount: "10", currency: "USD", occurredAt: "2026-01-01T00:00:00.000Z" },
        ],
      }),
    );

    expect(result).toEqual({ imported: 0 });
  });
});
