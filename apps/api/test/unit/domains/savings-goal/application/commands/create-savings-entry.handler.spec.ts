import { describe, expect, it, vi } from "vitest";

import { CreateSavingsEntryHandler } from "../../../../../../src/domains/savings-entry/application/commands/create-savings-entry.handler";
import { CreateSavingsEntryCommand } from "../../../../../../src/domains/savings-entry/application/commands/create-savings-entry.command";
import { SavingsEntry } from "../../../../../../src/domains/savings-entry/domain/savings-entry.aggregate";
import type { SavingsEntryRepositoryPort } from "../../../../../../src/domains/savings-entry/domain/ports/savings-entry.repository.port";

function fakeRepo(overrides: Partial<SavingsEntryRepositoryPort> = {}): SavingsEntryRepositoryPort {
  return {
    list: vi.fn(),
    create: vi.fn(),
    ...overrides,
  };
}

describe("CreateSavingsEntryHandler", () => {
  it("converts contributedAt to a Date and persists via the repository", async () => {
    const create = vi.fn().mockImplementation(async (userId: string, plan) =>
      SavingsEntry.fromPersistence({
        id: "e1",
        userId,
        ...plan,
        createdAt: new Date("2026-02-01T00:00:00Z"),
      }),
    );
    const repo = fakeRepo({ create });
    const handler = new CreateSavingsEntryHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(
      new CreateSavingsEntryCommand("u1", {
        amount: "250",
        currency: "USD",
        contributedAt: "2026-02-01T00:00:00.000Z",
      }),
    );

    expect(result.id).toBe("e1");
    expect(result.amount).toBe("250.0000");
    expect(create.mock.calls[0]![1].contributedAt).toBeInstanceOf(Date);
    expect(create.mock.calls[0]![1].savingsGoalId).toBeNull();
  });
});
