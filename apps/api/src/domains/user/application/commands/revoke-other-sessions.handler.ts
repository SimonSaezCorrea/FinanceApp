import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import { RevokeOtherSessionsCommand } from "./revoke-other-sessions.command";

/**
 * "Cerrar todas las demás" (FR-006) — a no-op when the caller has no other OPEN
 * sessions, never an error (0 rows closed is still success). Stamps `closedAt`, same
 * as `CloseSessionHandler` (never deletes) — the caller's own session is structurally
 * excluded by the `WHERE id != exceptId` in the repository, not by re-checking after
 * the fact.
 */
@Injectable()
@CommandHandler(RevokeOtherSessionsCommand)
export class RevokeOtherSessionsHandler extends BaseCommandHandler<
  RevokeOtherSessionsCommand,
  void,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RevokeOtherSessionsCommand): Promise<HandleResult<void>> {
    await this.sessions.closeAllExceptForUser(command.userId, command.currentSessionId);
    return { result: undefined, events: [] };
  }
}
