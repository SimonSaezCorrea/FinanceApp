import { Injectable, Logger } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Cron, CronExpression } from "@nestjs/schedule";

import { CloseExpiredSessionsCommand } from "../../domains/user/application/commands/close-expired-sessions.command";
import { PurgeClosedSessionsCommand } from "../../domains/user/application/commands/purge-closed-sessions.command";

/** Daily two-phase sweep (amendment 2026-09-19) — same thin-trigger shape as
 * `IdempotencyCleanupCron`, offset an hour later so the two don't compete. Phase 1
 * "detects" naturally time-expired sessions (stamps `closedAt`, same as an explicit
 * close); phase 2 purges anything closed past the retention window — always run in
 * this order so a session that just expired gets its retention window measured from
 * THIS tick, not skipped until the next one. */
@Injectable()
export class SessionCleanupCron {
  private readonly logger = new Logger(SessionCleanupCron.name);

  constructor(private readonly commandBus: CommandBus) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async run(): Promise<void> {
    const closed = await this.commandBus.execute(new CloseExpiredSessionsCommand());
    const purged = await this.commandBus.execute(new PurgeClosedSessionsCommand());
    this.logger.log(`Closed ${closed} expired sessions, purged ${purged} past retention`);
  }
}
