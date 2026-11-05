import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/** Days a used or expired second-factor code is kept before the daily sweep deletes it. */
export const MFA_CODE_RETENTION_DAYS = 7;

/** Daily sweep (specs/040): deletes codes used or expired more than a week ago. They are already
 * refused by then; the limits only look at the last hour. */
export class PurgeStaleMfaCodesCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(
    public readonly cutoff: Date = new Date(
      Date.now() - MFA_CODE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ),
  ) {}
}
