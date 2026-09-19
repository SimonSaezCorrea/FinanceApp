import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import type { auth } from "@finance/contracts";

import { getPasskeyExpectedOrigin, getPasskeyRpId } from "../../../../infra/config/passkey.config";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import { PasskeyChallengeInvalidError } from "../../domain/errors";
import { ConfirmPasskeyRegistrationCommand } from "./confirm-passkey-registration.command";

@Injectable()
@CommandHandler(ConfirmPasskeyRegistrationCommand)
export class ConfirmPasskeyRegistrationHandler extends BaseCommandHandler<
  ConfirmPasskeyRegistrationCommand,
  auth.Passkey,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(
    command: ConfirmPasskeyRegistrationCommand,
  ): Promise<HandleResult<auth.Passkey>> {
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: command.response as RegistrationResponseJSON,
        expectedChallenge: command.expectedChallenge,
        expectedOrigin: getPasskeyExpectedOrigin(this.config),
        expectedRPID: getPasskeyRpId(this.config),
      });
    } catch {
      throw new PasskeyChallengeInvalidError();
    }
    if (!verification.verified || !verification.registrationInfo) {
      throw new PasskeyChallengeInvalidError();
    }

    const { credential } = verification.registrationInfo;
    const created = await this.passkeys.createWithTx(this.prisma, {
      userId: command.userId,
      name: command.name,
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
    });

    return {
      result: {
        id: created.id,
        name: created.name,
        createdAt: created.createdAt,
        lastUsedAt: null,
      },
      events: [],
    };
  }
}
