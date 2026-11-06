import type { UserScopedCommand as UserScopedQuery } from "../../../../infra/cqrs/base-command.handler";

/** specs/041: a name for a passkey being registered, from its authenticator's model. */
export class SuggestPasskeyNameQuery implements UserScopedQuery {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    /** The browser's registration response, read only — nothing is verified or saved. */
    public readonly response: unknown,
  ) {}
}
