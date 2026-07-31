import { describe, expect, it } from "vitest";

import { BaseQueryHandler, type BaseQuery } from "../../../../src/infra/cqrs/base-query.handler";

type FakeQuery = BaseQuery & { id: string };

class FakeQueryHandler extends BaseQueryHandler<FakeQuery, { id: string; loaded: boolean }> {
  protected async loadContext(query: FakeQuery): Promise<{ id: string }> {
    return { id: query.id };
  }

  protected async handle(
    _query: FakeQuery,
    context: { id: string },
  ): Promise<{ id: string; loaded: boolean }> {
    return { id: context.id, loaded: true };
  }
}

describe("BaseQueryHandler (Template Method, read-only)", () => {
  it("runs load -> handle and returns handle()'s result, with no persist/publish steps", async () => {
    const handler = new FakeQueryHandler();
    const result = await handler.execute({ scope: "user", userId: "u1", id: "abc" });
    expect(result).toEqual({ id: "abc", loaded: true });
  });

  it("supports scope: system queries with no userId", async () => {
    const handler = new FakeQueryHandler();
    const result = await handler.execute({ scope: "system", id: "sys" } as FakeQuery);
    expect(result).toEqual({ id: "sys", loaded: true });
  });
});
