import type { UserScopedCommand as UserScopedQuery } from "../../../../infra/cqrs/base-command.handler";

export class ListTrustedDevicesQuery implements UserScopedQuery {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    /** This browser's `mfa_trusted` cookie, to mark its own row (`isCurrent`). */
    public readonly currentToken?: string,
  ) {}
}
