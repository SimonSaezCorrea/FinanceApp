import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { UnauthorizedError } from "../../domain/errors";
import type { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { MarkReleaseNotesSeenCommand } from "./mark-release-notes-seen.command";

interface Context {
  user: User;
  changed: boolean;
}

/**
 * Novedades (spec 038): remembers, on the account, the newest version the person saw, so the app's
 * "new" dot goes away on every device. Only moves forward; a repeat or an older version writes
 * nothing (Principle VII form a). The version is not checked against the records (the API doesn't
 * ship them): a made-up future version only hides the person's own dot.
 */
@Injectable()
@CommandHandler(MarkReleaseNotesSeenCommand)
export class MarkReleaseNotesSeenHandler extends BaseCommandHandler<
  MarkReleaseNotesSeenCommand,
  void,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: MarkReleaseNotesSeenCommand): Promise<Context> {
    const user = await this.repo.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    return { user, changed: false };
  }

  protected async handle(
    command: MarkReleaseNotesSeenCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    context.changed = context.user.markReleaseNotesSeen(command.version);
    return { result: undefined, events: [] };
  }

  protected override async persist(context: Context): Promise<void> {
    // Only its own column: never put back stale security state (run-2).
    if (context.changed) await this.repo.saveFields(context.user, ["releaseNotesSeenVersion"]);
  }
}
