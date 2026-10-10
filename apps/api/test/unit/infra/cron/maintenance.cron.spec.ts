import { Logger } from "@nestjs/common";
import type { CommandBus } from "@nestjs/cqrs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PurgeExpiredRecordsCommand } from "../../../../src/domains/idempotency-record/application/commands/purge-expired-records.command";
import { PurgeExpiredCacheCommand } from "../../../../src/domains/ip-geolocation-cache/application/commands/purge-expired-cache.command";
import { CloseExpiredSessionsCommand } from "../../../../src/domains/user/application/commands/close-expired-sessions.command";
import { PurgeClosedSessionsCommand } from "../../../../src/domains/user/application/commands/purge-closed-sessions.command";
import { MaintenanceCron } from "../../../../src/infra/cron/maintenance.cron";

function busRunning(behaviour: (command: unknown) => Promise<number>): {
  bus: CommandBus;
  ran: string[];
} {
  const ran: string[] = [];
  const bus = {
    execute: vi.fn((command: object) => {
      ran.push(command.constructor.name);
      return behaviour(command);
    }),
  } as unknown as CommandBus;
  return { bus, ran };
}

describe("MaintenanceCron", () => {
  afterEach(() => vi.restoreAllMocks());

  it("runs the three sweeps, closing expired sessions before purging them", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const { bus, ran } = busRunning(() => Promise.resolve(0));

    await new MaintenanceCron(bus).run();

    expect(ran).toEqual([
      PurgeExpiredRecordsCommand.name,
      CloseExpiredSessionsCommand.name,
      PurgeClosedSessionsCommand.name,
      PurgeExpiredCacheCommand.name,
    ]);
  });

  it("keeps going when one sweep fails, and logs that failure", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { bus, ran } = busRunning((command) =>
      command instanceof PurgeExpiredRecordsCommand
        ? Promise.reject(new Error("db down"))
        : Promise.resolve(0),
    );

    await expect(new MaintenanceCron(bus).run()).resolves.toBeUndefined();

    expect(ran).toContain(PurgeExpiredCacheCommand.name);
    expect(ran).toContain(PurgeClosedSessionsCommand.name);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("idempotency records failed"));
  });
});
