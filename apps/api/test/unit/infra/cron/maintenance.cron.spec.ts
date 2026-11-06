import { Logger } from "@nestjs/common";
import type { CommandBus } from "@nestjs/cqrs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PurgeExpiredRecordsCommand } from "../../../../src/domains/idempotency-record/application/commands/purge-expired-records.command";
import { PurgeExpiredCacheCommand } from "../../../../src/domains/ip-geolocation-cache/application/commands/purge-expired-cache.command";
import { CloseExpiredSessionsCommand } from "../../../../src/domains/user/application/commands/close-expired-sessions.command";
import { PurgeClosedSessionsCommand } from "../../../../src/domains/user/application/commands/purge-closed-sessions.command";
import { PurgeStaleEmailTokensCommand } from "../../../../src/domains/user/application/commands/purge-stale-email-tokens.command";
import { RefreshAuthenticatorCatalogCommand } from "../../../../src/domains/user/application/commands/refresh-authenticator-catalog.command";
import { ReviewCompromisedPasskeysCommand } from "../../../../src/domains/user/application/commands/review-compromised-passkeys.command";
import { PurgeStaleMfaCodesCommand } from "../../../../src/domains/user/application/commands/purge-stale-mfa-codes.command";
import { PurgeExpiredTrustedDevicesCommand } from "../../../../src/domains/user/application/commands/purge-expired-trusted-devices.command";
import type { CronSwitch } from "../../../../src/infra/config/cron.config";
import { MaintenanceCron } from "../../../../src/infra/cron/maintenance.cron";

const ON = { enabled: true } as CronSwitch;
const OFF = { enabled: false } as CronSwitch;

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

  it("runs the six sweeps and the FIDO catalog, closing expired sessions before purging them", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const { bus, ran } = busRunning(() => Promise.resolve(0));

    await new MaintenanceCron(bus, ON).run();

    expect(ran).toEqual([
      PurgeExpiredRecordsCommand.name,
      CloseExpiredSessionsCommand.name,
      PurgeClosedSessionsCommand.name,
      PurgeExpiredCacheCommand.name,
      PurgeStaleEmailTokensCommand.name,
      PurgeExpiredTrustedDevicesCommand.name,
      PurgeStaleMfaCodesCommand.name,
      RefreshAuthenticatorCatalogCommand.name,
      ReviewCompromisedPasskeysCommand.name,
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

    await expect(new MaintenanceCron(bus, ON).run()).resolves.toBeUndefined();

    expect(ran).toContain(PurgeExpiredCacheCommand.name);
    expect(ran).toContain(PurgeClosedSessionsCommand.name);
    expect(ran).toContain(PurgeStaleEmailTokensCommand.name);
    expect(ran).toContain(PurgeExpiredTrustedDevicesCommand.name);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("idempotency records failed"));
  });

  it("does nothing while scheduled jobs are off", async () => {
    const { bus, ran } = busRunning(() => Promise.resolve(0));

    await new MaintenanceCron(bus, OFF).run();

    expect(ran).toEqual([]);
  });

  it("at boot, fetches the FIDO catalog only if none is stored, then reviews", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const commands: unknown[] = [];
    const bus = {
      execute: vi.fn((command: unknown) => {
        commands.push(command);
        return Promise.resolve({ replaced: false, reason: "skipped", marked: 0 });
      }),
    } as unknown as CommandBus;
    new MaintenanceCron(bus, ON).onApplicationBootstrap();
    await vi.waitFor(() => expect(commands).toHaveLength(2));
    expect((commands[0] as RefreshAuthenticatorCatalogCommand).onlyIfEmpty).toBe(true);
    expect(commands[1]).toBeInstanceOf(ReviewCompromisedPasskeysCommand);

    const idle = { execute: vi.fn() } as unknown as CommandBus;
    new MaintenanceCron(idle, OFF).onApplicationBootstrap();
    expect(idle.execute).not.toHaveBeenCalled();
  });
});
