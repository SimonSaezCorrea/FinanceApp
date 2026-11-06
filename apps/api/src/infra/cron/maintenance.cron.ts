import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Cron } from "@nestjs/schedule";

import { reportError } from "../../instrument";
import { CronSwitch } from "../config/cron.config";
import { PurgeExpiredRecordsCommand } from "../../domains/idempotency-record/application/commands/purge-expired-records.command";
import { PurgeExpiredCacheCommand } from "../../domains/ip-geolocation-cache/application/commands/purge-expired-cache.command";
import { CloseExpiredSessionsCommand } from "../../domains/user/application/commands/close-expired-sessions.command";
import { PurgeClosedSessionsCommand } from "../../domains/user/application/commands/purge-closed-sessions.command";
import { PurgeStaleEmailTokensCommand } from "../../domains/user/application/commands/purge-stale-email-tokens.command";
import { PurgeExpiredTrustedDevicesCommand } from "../../domains/user/application/commands/purge-expired-trusted-devices.command";
import { PurgeStaleMfaCodesCommand } from "../../domains/user/application/commands/purge-stale-mfa-codes.command";
import { RefreshAuthenticatorCatalogCommand } from "../../domains/user/application/commands/refresh-authenticator-catalog.command";
import { ReviewCompromisedPasskeysCommand } from "../../domains/user/application/commands/review-compromised-passkeys.command";
import type { CatalogRefreshOutcome } from "../../domains/user/application/authenticator-catalog";
import type { ReviewOutcome } from "../../domains/user/application/commands/review-compromised-passkeys.handler";

/**
 * Daily housekeeping at 03:00 Chile time — one trigger for what used to be three crons (3, 4 and
 * 5 AM, merged 2026-10-10). None of it changes what a user sees: every reader already ignores
 * expired rows; this only keeps the tables from growing without bound.
 *
 * 1. Idempotency attempts past their retention window (FR-016).
 * 2. Sessions: stamp `closedAt` on the naturally expired ones, THEN purge those closed past the
 *    3-day retention — in this order, so one that just expired starts its retention today.
 * 3. IP→country cache rows past their 60-day TTL (specs/026).
 * 4. Email links expired or used more than 7 days ago (specs/032).
 * 5. Remembered devices whose 30 days ran out (specs/040).
 * 6. Second-factor codes used or expired more than 7 days ago (specs/040).
 * 7. The FIDO catalog (specs/041): download a newer signed one, then review passkeys of models it
 *    declares compromised (also at boot when no catalog is stored yet).
 *
 * Each step runs on its own: one failing is logged and never stops the others.
 */
@Injectable()
export class MaintenanceCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceCron.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly crons: CronSwitch,
  ) {}

  /** A fresh install gets its FIDO catalog at start-up instead of at the next 03:00. */
  onApplicationBootstrap(): void {
    if (!this.crons.enabled) return;
    void this.fidoCatalog(true);
  }

  @Cron("0 3 * * *", { timeZone: "America/Santiago" })
  async run(): Promise<void> {
    if (!this.crons.enabled) return;
    await this.step("idempotency records", async () => {
      const deleted = await this.commandBus.execute<PurgeExpiredRecordsCommand, number>(
        new PurgeExpiredRecordsCommand(),
      );
      return `purged ${deleted} expired`;
    });
    await this.step("sessions", async () => {
      const closed = await this.commandBus.execute<CloseExpiredSessionsCommand, number>(
        new CloseExpiredSessionsCommand(),
      );
      const purged = await this.commandBus.execute<PurgeClosedSessionsCommand, number>(
        new PurgeClosedSessionsCommand(),
      );
      return `closed ${closed} expired, purged ${purged} past retention`;
    });
    await this.step("IP geolocation cache", async () => {
      const deleted = await this.commandBus.execute<PurgeExpiredCacheCommand, number>(
        new PurgeExpiredCacheCommand(),
      );
      return `purged ${deleted} expired rows`;
    });
    await this.step("email links", async () => {
      const deleted = await this.commandBus.execute<PurgeStaleEmailTokensCommand, number>(
        new PurgeStaleEmailTokensCommand(),
      );
      return `purged ${deleted} expired or used`;
    });
    await this.step("remembered devices", async () => {
      const deleted = await this.commandBus.execute<PurgeExpiredTrustedDevicesCommand, number>(
        new PurgeExpiredTrustedDevicesCommand(),
      );
      return `purged ${deleted} expired`;
    });
    await this.step("second-factor codes", async () => {
      const deleted = await this.commandBus.execute<PurgeStaleMfaCodesCommand, number>(
        new PurgeStaleMfaCodesCommand(),
      );
      return `purged ${deleted} expired or used`;
    });
    await this.fidoCatalog(false);
  }

  /** The catalog first; the review runs on whatever is stored even if the download failed. */
  private async fidoCatalog(onlyIfEmpty: boolean): Promise<void> {
    await this.step("FIDO catalog", async () => {
      const outcome = await this.commandBus.execute<
        RefreshAuthenticatorCatalogCommand,
        CatalogRefreshOutcome
      >(new RefreshAuthenticatorCatalogCommand(onlyIfEmpty));
      return outcome.replaced
        ? `replaced ${outcome.models} models (catalog #${outcome.number})`
        : `kept the stored catalog (${outcome.reason})`;
    });
    await this.step("compromised passkeys", async () => {
      const outcome = await this.commandBus.execute<
        ReviewCompromisedPasskeysCommand,
        ReviewOutcome
      >(new ReviewCompromisedPasskeysCommand());
      return outcome.skipped
        ? `skipped (${outcome.skipped})`
        : `marked ${outcome.marked}, closed ${outcome.sessionsClosed} sessions`;
    });
  }

  private async step(name: string, work: () => Promise<string>): Promise<void> {
    try {
      this.logger.log(`${name}: ${await work()}`);
    } catch (err: unknown) {
      this.logger.error(`${name} failed: ${String(err)}`);
      reportError(err);
    }
  }
}
