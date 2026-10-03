import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import {
  SESSION_STEP_UP,
  type SessionStepUpPort,
} from "../../../session/domain/ports/session-step-up.port";
import { assertRecentStepUp } from "../step-up";
import { RevokeOtherSessionsCommand } from "./revoke-other-sessions.command";

/**
 * "Cerrar todas las demás" (FR-006) — a no-op when the caller has no other OPEN
 * sessions, never an error (0 rows closed is still success). Stamps `closedAt`, same
 * as `CloseSessionHandler` (never deletes) — the caller's own session is structurally
 * excluded by the `WHERE id != exceptId` in the repository, not by re-checking after
 * the fact.
 *
 * Needs a recent step-up from the caller's own session (2026-09-25, `STEP_UP_REQUIRED` 403).
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
    @Inject(SESSION_STEP_UP) private readonly stepUp: SessionStepUpPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RevokeOtherSessionsCommand): Promise<HandleResult<void>> {
    await assertRecentStepUp(this.stepUp, command.userId, command.currentSessionId);
    await this.sessions.closeAllExceptForUser(command.userId, command.currentSessionId);
    return { result: undefined, events: [] };
  }
}
