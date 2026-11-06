import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/**
 * Daily (specs/041 US3): marks the verified passkeys whose authenticator model the stored FIDO
 * catalog declares compromised, closes the sessions opened with them and notifies their owners.
 * Safe to repeat: only what a run newly marks is closed and notified.
 */
export class ReviewCompromisedPasskeysCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly now: Date = new Date()) {}
}
