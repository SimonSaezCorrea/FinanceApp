import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  EMAIL_TOKEN_REPOSITORY,
  type EmailTokenRepositoryPort,
} from "../../../email-token/domain/ports/email-token.repository.port";
import { PurgeStaleEmailTokensCommand } from "./purge-stale-email-tokens.command";

@Injectable()
@CommandHandler(PurgeStaleEmailTokensCommand)
export class PurgeStaleEmailTokensHandler extends BaseCommandHandler<
  PurgeStaleEmailTokensCommand,
  number,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(EMAIL_TOKEN_REPOSITORY) private readonly tokens: EmailTokenRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: PurgeStaleEmailTokensCommand): Promise<HandleResult<number>> {
    return { result: await this.tokens.purgeStale(command.cutoff), events: [] };
  }
}
