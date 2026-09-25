import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

import type { auth } from "@finance/contracts";

import { getPasskeyRpId } from "../../../../infra/config/passkey.config";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import { UnauthorizedError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { StartPasskeyRegistrationCommand } from "./start-passkey-registration.command";

const RP_NAME = "Cuadra";

@Injectable()
@CommandHandler(StartPasskeyRegistrationCommand)
export class StartPasskeyRegistrationHandler extends BaseCommandHandler<
  StartPasskeyRegistrationCommand,
  auth.StartPasskeyRegistrationResponse,
  User
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
    private readonly config: ConfigService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: StartPasskeyRegistrationCommand): Promise<User> {
    const user = await this.repo.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    return user;
  }

  protected async handle(
    _command: StartPasskeyRegistrationCommand,
    user: User,
  ): Promise<HandleResult<auth.StartPasskeyRegistrationResponse>> {
    const existing = await this.passkeys.findByUserId(user.id);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: getPasskeyRpId(this.config),
      userName: user.email ?? user.id,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: existing.map((p) => ({
        id: p.credentialId,
        transports: p.transports as AuthenticatorTransportFuture[],
      })),
    });
    return { result: { options }, events: [] };
  }
}
