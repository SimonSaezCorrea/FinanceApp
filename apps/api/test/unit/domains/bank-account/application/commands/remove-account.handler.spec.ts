import { describe, expect, it, vi } from "vitest";

import { RemoveAccountCommand } from "../../../../../../src/domains/bank-account/application/commands/remove-account.command";
import { RemoveAccountHandler } from "../../../../../../src/domains/bank-account/application/commands/remove-account.handler";
import {
  AccountNotFoundError,
  CashAccountRequiredError,
} from "../../../../../../src/domains/bank-account/domain/errors";
import { accountAggregate, fakeBankAccountRepo } from "../../../../support/fake-ports";

function makeHandler(
  type: Parameters<typeof accountAggregate>[0]["type"],
  cashCount: number,
  remove = vi.fn(async () => true),
) {
  const repo = fakeBankAccountRepo({
    findById: vi.fn(async () => accountAggregate({ id: "a1", type })),
    countByType: vi.fn(async () => cashCount),
    remove,
  });
  return { handler: new RemoveAccountHandler({ publish: vi.fn() } as never, repo), remove };
}

describe("RemoveAccountHandler", () => {
  it("refuses to delete the user's only cash account", async () => {
    const { handler, remove } = makeHandler("CASH", 1);
    await expect(handler.execute(new RemoveAccountCommand("u1", "a1"))).rejects.toBeInstanceOf(
      CashAccountRequiredError,
    );
    // And it never reached the repository: nothing half-deleted.
    expect(remove).not.toHaveBeenCalled();
  });

  it("allows deleting a second cash account", async () => {
    const { handler, remove } = makeHandler("CASH", 2);
    await handler.execute(new RemoveAccountCommand("u1", "a1"));
    expect(remove).toHaveBeenCalledWith("u1", "a1");
  });

  it("leaves every other account type alone", async () => {
    const { handler, remove } = makeHandler("CHECKING", 1);
    await handler.execute(new RemoveAccountCommand("u1", "a1"));
    expect(remove).toHaveBeenCalled();
  });

  it("still answers ACCOUNT_NOT_FOUND for someone else's account", async () => {
    const repo = fakeBankAccountRepo({ findById: vi.fn(async () => null) });
    const handler = new RemoveAccountHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new RemoveAccountCommand("u1", "ghost"))).rejects.toBeInstanceOf(
      AccountNotFoundError,
    );
  });
});
