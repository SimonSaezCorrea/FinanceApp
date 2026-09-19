import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import { PasskeyNotFoundError } from "../../domain/errors";
import { RemovePasskeyCommand } from "./remove-passkey.command";

@Injectable()
@CommandHandler(RemovePasskeyCommand)
export class RemovePasskeyHandler extends BaseCommandHandler<RemovePasskeyCommand, void, null> {
  constructor(
    eventBus: EventBus,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RemovePasskeyCommand): Promise<HandleResult<void>> {
    const deleted = await this.passkeys.deleteOwned(command.userId, command.passkeyId);
    if (!deleted) throw new PasskeyNotFoundError();
    return { result: undefined, events: [] };
  }
}
