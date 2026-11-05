import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  MFA_CODE_REPOSITORY,
  type MfaCodeRepositoryPort,
} from "../../../mfa-code/domain/ports/mfa-code.repository.port";
import { PurgeStaleMfaCodesCommand } from "./purge-stale-mfa-codes.command";

@Injectable()
@CommandHandler(PurgeStaleMfaCodesCommand)
export class PurgeStaleMfaCodesHandler extends BaseCommandHandler<
  PurgeStaleMfaCodesCommand,
  number,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(MFA_CODE_REPOSITORY) private readonly codes: MfaCodeRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: PurgeStaleMfaCodesCommand): Promise<HandleResult<number>> {
    return { result: await this.codes.purgeStale(command.cutoff), events: [] };
  }
}
