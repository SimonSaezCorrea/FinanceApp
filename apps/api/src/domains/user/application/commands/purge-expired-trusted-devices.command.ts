import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/**
 * Daily sweep (specs/040) — deletes remembered devices whose 30 days ran out. Login already
 * refuses an expired one; this only keeps `trusted-device` from growing without bound.
 */
export class PurgeExpiredTrustedDevicesCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly now: Date = new Date()) {}
}
