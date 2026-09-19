import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import { PurgeClosedSessionsCommand } from "./purge-closed-sessions.command";

@Injectable()
@CommandHandler(PurgeClosedSessionsCommand)
export class PurgeClosedSessionsHandler extends BaseCommandHandler<
  PurgeClosedSessionsCommand,
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

  protected async handle(command: PurgeClosedSessionsCommand): Promise<HandleResult<number>> {
    const purged = await this.sessions.purgeClosedBefore(command.cutoff);
    return { result: purged, events: [] };
  }
}
