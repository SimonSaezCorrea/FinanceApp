import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/**
 * One tick of the recorder: bring the `exchange-rate` table up to date for today (Chile).
 * Genuinely system-wide — not tied to any request or user — so it is a named, typed
 * `scope: "system"` command, the same exception to Principle II the other crons use.
 */
export class RecordExchangeRatesCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(
    public readonly now: Date = new Date(),
    /** The last tick of the day (20:00): a source that is still down leaves today carrying
     * the last known value instead of no row at all. */
    public readonly isLastTickOfDay: boolean = false,
  ) {}
}
