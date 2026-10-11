import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** `POST /auth/me/emails` (specs/032): the new address stays pending until its link is followed;
 * the current one keeps receiving email and recovering the password meanwhile. */
export class RequestEmailChangeCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly address: string,
  ) {}
}
