import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/**
 * Daily (security run-3): finds stored files with no attachment row, left before the
 * `storage-deletion` trigger existed or by any path it might miss, and queues them for deletion.
 * System-wide, the same named exception to Principle II as the other maintenance sweeps.
 */
export class SweepOrphanObjectsCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly now: Date = new Date()) {}
}
