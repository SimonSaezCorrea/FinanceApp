import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import { CloseExpiredSessionsCommand } from "./close-expired-sessions.command";

@Injectable()
@CommandHandler(CloseExpiredSessionsCommand)
export class CloseExpiredSessionsHandler extends BaseCommandHandler<
  CloseExpiredSessionsCommand,
  number,
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

  protected async handle(command: CloseExpiredSessionsCommand): Promise<HandleResult<number>> {
    const closed = await this.sessions.markExpiredAsClosed(command.now);
    return { result: closed, events: [] };
  }
}
