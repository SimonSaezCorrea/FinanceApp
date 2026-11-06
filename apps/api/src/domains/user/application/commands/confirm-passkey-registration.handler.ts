import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import type { auth } from "@finance/contracts";

import { getPasskeyExpectedOrigins, getPasskeyRpId } from "../../../../infra/config/passkey.config";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import {
  PasskeyAuthenticatorCompromisedError,
  PasskeyChallengeInvalidError,
} from "../../domain/errors";
import { AuthenticatorCatalog } from "../authenticator-catalog";
import { PasskeyAttestation, type AttestationOutcome } from "../passkey-attestation";
import { passkeyToContract } from "../passkey-dto";
import { ConfirmPasskeyRegistrationCommand } from "./confirm-passkey-registration.command";
import { AccountSecurityEvent } from "../../domain/events/account-security.event";

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
    private readonly attestation: PasskeyAttestation,
    private readonly catalog: AuthenticatorCatalog,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(
    command: ConfirmPasskeyRegistrationCommand,
  ): Promise<HandleResult<auth.Passkey>> {
    let outcome: AttestationOutcome;
    try {
      outcome = await this.attestation.verifyRegistration({
        response: command.response,
        expectedChallenge: command.expectedChallenge,
        expectedOrigin: getPasskeyExpectedOrigins(this.config),
        expectedRPID: getPasskeyRpId(this.config),
      });
    } catch {
      throw new PasskeyChallengeInvalidError();
    }
    const { verification, authenticator } = outcome;
    if (!verification.verified || !verification.registrationInfo) {
      throw new PasskeyChallengeInvalidError();
    }
    // specs/041 US2: a proven model the FIDO catalog declares compromised is never registered —
    // even with an expired copy of the catalog (FR-007).
    if (authenticator && (await this.catalog.compromisedStatus(authenticator.aaguid))) {
      throw new PasskeyAuthenticatorCompromisedError();
    }

    const { credential } = verification.registrationInfo;
    const created = await this.passkeys.createWithTx(this.prisma, {
      userId: command.userId,
      name: command.name,
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      aaguid: authenticator?.aaguid ?? null,
      authenticatorName: authenticator?.name ?? null,
      verifiedAt: authenticator ? new Date() : null,
    });

    return {
      result: passkeyToContract(created),
      events: [
        new AccountSecurityEvent(
          command.userId,
          "PASSKEY_ADDED",
          new Date(),
          created.name,
          undefined,
          authenticator?.name,
        ),
      ],
    };
  }
}
