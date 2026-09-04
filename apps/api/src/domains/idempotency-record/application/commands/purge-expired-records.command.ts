import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/**
 * Daily sweep of attempts past their retention window. Genuinely system-wide,
 * not tied to any request or user — a named, typed exception to Principle II,
 * and the only kind this domain has.
 */
export class PurgeExpiredRecordsCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly now: Date = new Date()) {}
}
