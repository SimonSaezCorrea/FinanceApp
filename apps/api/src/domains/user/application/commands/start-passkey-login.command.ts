import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/** No authenticated user yet — same `scope: "system"` precedent as `LoginCommand`. `email`
 * omitted = discoverable/"usernameless" login: the browser is left to offer any resident
 * passkey for this site itself (`allowCredentials` left unset), and the account is resolved
 * later from the credential the user picks, not from a typed email. */
export class StartPasskeyLoginCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly email?: string) {}
}
