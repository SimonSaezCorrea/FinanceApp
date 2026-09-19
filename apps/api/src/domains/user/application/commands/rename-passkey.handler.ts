import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import { PasskeyNotFoundError } from "../../domain/errors";
import { RenamePasskeyCommand } from "./rename-passkey.command";

@Injectable()
@CommandHandler(RenamePasskeyCommand)
export class RenamePasskeyHandler extends BaseCommandHandler<
  RenamePasskeyCommand,
  auth.Passkey,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RenamePasskeyCommand): Promise<HandleResult<auth.Passkey>> {
    const renamed = await this.passkeys.renameOwned(
      command.userId,
      command.passkeyId,
      command.name,
    );
    if (!renamed) throw new PasskeyNotFoundError();
    return {
      result: {
        id: renamed.id,
        name: renamed.name,
        createdAt: renamed.createdAt,
        lastUsedAt: renamed.lastUsedAt,
      },
      events: [],
    };
  }
}
