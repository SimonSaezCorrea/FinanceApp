import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** `DELETE /auth/me/emails/:id` (specs/032): any address but the primary. */
export class RemoveUserEmailCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly userEmailId: string,
  ) {}
}
