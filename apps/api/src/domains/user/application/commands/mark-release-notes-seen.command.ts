import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** `POST /auth/me/release-notes/seen` (spec 038): the person opened Novedades. */
export class MarkReleaseNotesSeenCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly releaseId: string,
  ) {}
}
