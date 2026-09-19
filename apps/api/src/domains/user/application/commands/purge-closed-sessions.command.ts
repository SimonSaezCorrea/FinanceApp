import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";
import { SESSION_CLOSED_RETENTION_DAYS } from "../../../session/domain/session.entity";

/**
 * Daily sweep, phase 2 ("purge") — deletes every `Session` closed more than
 * `SESSION_CLOSED_RETENTION_DAYS` ago (amendment 2026-09-19). Runs AFTER
 * `CloseExpiredSessionsCommand` in the same cron tick, so a session that just expired
 * naturally gets its retention window measured from THIS run, not the previous one.
 */
export class PurgeClosedSessionsCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(
    public readonly cutoff: Date = new Date(
      Date.now() - SESSION_CLOSED_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ),
  ) {}
}
