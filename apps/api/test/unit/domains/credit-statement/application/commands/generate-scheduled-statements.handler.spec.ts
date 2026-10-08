import { describe, expect, it, vi } from "vitest";

import { GenerateScheduledStatementsCommand } from "../../../../../../src/domains/credit-statement/application/commands/generate-scheduled-statements.command";
import { GenerateScheduledStatementsHandler } from "../../../../../../src/domains/credit-statement/application/commands/generate-scheduled-statements.handler";
import { GenerateStatementsCommand } from "../../../../../../src/domains/credit-statement/application/commands/generate-statements.command";
import { fakeCreditStatementRepo } from "../../../../support/fake-ports";

const due = (accountId: string) => ({
  userId: "u1",
  accountId,
  periodStart: new Date("2026-09-18T00:00:00.000Z"),
  closedAt: new Date("2026-10-21T23:59:59.999Z"),
  dueDate: new Date("2026-11-04T23:59:59.999Z"),
});

describe("GenerateScheduledStatementsHandler", () => {
  it("generates each due account through the same command a user triggers", async () => {
    const execute = vi.fn(async (_command: unknown) => true);
    const handler = new GenerateScheduledStatementsHandler(
      { publish: vi.fn() } as never,
      { execute } as never,
      fakeCreditStatementRepo({ listDueScheduled: vi.fn(async () => [due("a1"), due("a2")]) }),
    );
    const result = await handler.execute(new GenerateScheduledStatementsCommand());
    expect(result).toBe(2);
    expect(execute).toHaveBeenCalledTimes(2);
    const sent = execute.mock.calls[0]![0] as GenerateStatementsCommand;
    expect(sent).toBeInstanceOf(GenerateStatementsCommand);
    expect(sent).toMatchObject({ userId: "u1", accountId: "a1" });
    expect(sent.closedAt).toEqual(due("a1").closedAt);
  });

  it("an account that fails doesn't stop the rest", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("STATEMENT_PERIOD_OVERLAPS"))
      .mockResolvedValueOnce(true);
    const handler = new GenerateScheduledStatementsHandler(
      { publish: vi.fn() } as never,
      { execute } as never,
      fakeCreditStatementRepo({ listDueScheduled: vi.fn(async () => [due("a1"), due("a2")]) }),
    );
    expect(await handler.execute(new GenerateScheduledStatementsCommand())).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
