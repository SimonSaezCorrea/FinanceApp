import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/** No authenticated user yet — same `scope: "system"` precedent as `LoginCommand`. */
export class VerifyPasskeyLoginCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(
    /** The raw WebAuthn response from `navigator.credentials.get()`, as JSON. */
    public readonly response: unknown,
    public readonly expectedChallenge: string,
    /** Resolved by the controller from the challenge cookie. Non-discoverable: `null` means the
     * email at `start-passkey-login` time had no passkeys (or didn't exist) — always a generic
     * failure. Discoverable: always `null` here too, but `discoverable` says to resolve the
     * account from whichever credential the response names instead of rejecting. */
    public readonly userId: string | null,
    public readonly discoverable: boolean,
  ) {}
}
