import { describe, expect, it, vi } from "vitest";

import { ListSavingsEntriesQueryHandler } from "../../../../../../src/domains/savings/application/queries/list-savings-entries.handler";
import { ListSavingsEntriesQuery } from "../../../../../../src/domains/savings/application/queries/list-savings-entries.query";
import { SavingsEntry } from "../../../../../../src/domains/savings/domain/savings-entry.aggregate";
import type { SavingsEntryRepositoryPort } from "../../../../../../src/domains/savings/domain/ports/savings-entry.repository.port";

function makeEntry(id: string) {
  return SavingsEntry.fromPersistence({
    id,
    userId: "u1",
    savingsGoalId: "g1",
    amount: "250",
    currency: "USD",
    contributedAt: new Date("2026-02-01T00:00:00Z"),
    note: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
  });
}

function fakeRepo(overrides: Partial<SavingsEntryRepositoryPort> = {}): SavingsEntryRepositoryPort {
  return {
    list: vi.fn(),
    create: vi.fn(),
    ...overrides,
  };
}

describe("ListSavingsEntriesQueryHandler", () => {
  it("lists the user's entries as contracts", async () => {
    const repo = fakeRepo({ list: vi.fn().mockResolvedValue([makeEntry("e1"), makeEntry("e2")]) });
    const handler = new ListSavingsEntriesQueryHandler(repo);
    const result = await handler.execute(new ListSavingsEntriesQuery("u1"));
    expect(result.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});
