import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/**
 * Daily sweep (security run-3): deletes from object storage the files whose attachment row is
 * gone. System-wide, not tied to any request or user — the same named exception to Principle II
 * as the other maintenance purges.
 */
export class PurgeDeletedObjectsCommand implements SystemCommand {
  readonly scope = "system" as const;
}
