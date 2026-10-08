import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/**
 * Hourly sweep: generates every statement whose scheduled close ("Editar fechas" on
 * the open period) has arrived. Genuinely system-wide, not tied to any request — a
 * named, typed exception to Principle II, dispatching one user-scoped
 * `GenerateStatementsCommand` per account, so every rule of generating by hand applies.
 */
export class GenerateScheduledStatementsCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly now: Date = new Date()) {}
}
