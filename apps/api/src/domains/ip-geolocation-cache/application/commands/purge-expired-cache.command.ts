import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/**
 * Daily sweep of cache rows past their TTL. Genuinely system-wide, not tied to any request or
 * user — same named, typed exception to Principle II that `PurgeExpiredRecordsCommand`
 * (`idempotency-record`) already establishes.
 */
export class PurgeExpiredCacheCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly now: Date = new Date()) {}
}
