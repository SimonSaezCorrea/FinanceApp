import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** `POST /auth/me/onboarding/close` (2026-10-11): the first-steps guide was finished or closed. */
export class CloseOnboardingCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(public readonly userId: string) {}
}
