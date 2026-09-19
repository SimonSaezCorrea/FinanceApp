import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/**
 * Daily sweep, phase 1 ("detect") — stamps `closedAt` on every `Session` whose
 * `expiresAt` already passed and that nobody closed explicitly (research.md R8,
 * amendment 2026-09-19). Genuinely system-wide, not tied to any request or user — same
 * named, typed exception to Principle II as `PurgeExpiredRecordsCommand`.
 */
export class CloseExpiredSessionsCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly now: Date = new Date()) {}
}
