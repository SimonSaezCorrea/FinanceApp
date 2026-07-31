import type { SystemCommand, UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** Manual "Generar facturación" trigger, scoped to one user's account. */
export class GenerateStatementsCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
  ) {}
}

/** Daily cron trigger — genuinely system-wide, not tied to any one request/user;
 * `loadContext` skips per-user scoping for this command type only (a named,
 * typed exception to Principle II — every row it touches is still internally
 * scoped to its own owning user via the repository). */
export class GenerateAllDueStatementsCommand implements SystemCommand {
  readonly scope = "system" as const;
}
