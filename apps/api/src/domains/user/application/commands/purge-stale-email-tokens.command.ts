import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/** Days a used or expired email link is kept before the daily sweep deletes it (specs/032). */
export const EMAIL_TOKEN_RETENTION_DAYS = 7;

/**
 * Daily sweep (specs/032) — deletes email links that expired or were used more than
 * `EMAIL_TOKEN_RETENTION_DAYS` ago. Nothing reads them by then: an expired or used link is
 * already refused; this only keeps `email-token` from growing without bound.
 */
export class PurgeStaleEmailTokensCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(
    public readonly cutoff: Date = new Date(
      Date.now() - EMAIL_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ),
  ) {}
}
