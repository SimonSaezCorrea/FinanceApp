import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class ConfirmPasskeyRegistrationCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly name: string,
    /** The raw WebAuthn response from `navigator.credentials.create()`, as JSON. */
    public readonly response: unknown,
    /** Resolved by the controller from the challenge cookie — never client-supplied. */
    public readonly expectedChallenge: string,
  ) {}
}
