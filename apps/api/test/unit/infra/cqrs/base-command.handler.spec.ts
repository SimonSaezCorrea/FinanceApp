import { describe, expect, it, vi } from "vitest";

import {
  BaseCommandHandler,
  type HandleResult,
  type UserScopedCommand,
} from "../../../../src/infra/cqrs/base-command.handler";

type FakeCommand = UserScopedCommand & { value: number };
type FakeContext = { loaded: boolean };

class FakeEvent {
  constructor(public readonly payload: number) {}
}

class FakeCommandHandler extends BaseCommandHandler<FakeCommand, number, FakeContext> {
  public persisted: { context: FakeContext; result: number } | null = null;

  protected async loadContext(): Promise<FakeContext> {
    return { loaded: true };
  }

  protected async handle(
    command: FakeCommand,
    context: FakeContext,
  ): Promise<HandleResult<number>> {
    expect(context.loaded).toBe(true);
    return { result: command.value * 2, events: [new FakeEvent(command.value)] };
  }

  protected override async persist(context: FakeContext, result: number): Promise<void> {
    this.persisted = { context, result };
  }
}

describe("BaseCommandHandler (Template Method)", () => {
  it("runs load -> handle -> persist -> publish in order and returns handle()'s result", async () => {
    const publish = vi.fn();
    const handler = new FakeCommandHandler({ publish } as never);

    const result = await handler.execute({ scope: "user", userId: "u1", value: 21 });

    expect(result).toBe(42);
    expect(handler.persisted).toEqual({ context: { loaded: true }, result: 42 });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(expect.any(FakeEvent));
  });

  it("defaults persist() to a no-op when not overridden", async () => {
    const publish = vi.fn();
    class NoPersistHandler extends BaseCommandHandler<FakeCommand, number, FakeContext> {
      protected async loadContext(): Promise<FakeContext> {
        return { loaded: true };
      }
      protected async handle(command: FakeCommand): Promise<HandleResult<number>> {
        return { result: command.value, events: [] };
      }
    }
    const handler = new NoPersistHandler({ publish } as never);
    const result = await handler.execute({ scope: "user", userId: "u1", value: 5 });
    expect(result).toBe(5);
    expect(publish).not.toHaveBeenCalled();
  });

  it("supports scope: system commands with no userId", async () => {
    type SystemFakeCommand = { scope: "system"; value: number };
    class SystemHandler extends BaseCommandHandler<SystemFakeCommand, number, null> {
      protected async loadContext(): Promise<null> {
        return null;
      }
      protected async handle(command: SystemFakeCommand): Promise<HandleResult<number>> {
        return { result: command.value, events: [] };
      }
    }
    const handler = new SystemHandler({ publish: vi.fn() } as never);
    const result = await handler.execute({ scope: "system", value: 7 });
    expect(result).toBe(7);
  });
});
