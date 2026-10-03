import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON, WebAuthnCredential } from "@simplewebauthn/server";

import type { auth } from "@finance/contracts";

import { getPasskeyExpectedOrigin, getPasskeyRpId } from "../../../../infra/config/passkey.config";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import {
  SESSION_STEP_UP,
  type SessionStepUpPort,
} from "../../../session/domain/ports/session-step-up.port";
import { InvalidCredentialsError, PasskeyChallengeInvalidError } from "../../domain/errors";
import { stepUpExpiry } from "../step-up";
import { VerifyStepUpPasskeyCommand } from "./verify-step-up-passkey.command";

/**
 * Step-up by passkey, step 2 (2026-09-25). The challenge must have been issued to THIS user and
 * the credential must be one of theirs; any failure is the same generic `INVALID_CREDENTIALS`,
 * like the passkey login. On success: the counter moves (clone detection) and the caller's own
 * session gets `stepUpAt`.
 */
@Injectable()
@CommandHandler(VerifyStepUpPasskeyCommand)
export class VerifyStepUpPasskeyHandler extends BaseCommandHandler<
  VerifyStepUpPasskeyCommand,
  auth.StepUpResponse,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
    @Inject(SESSION_STEP_UP) private readonly stepUp: SessionStepUpPort,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(
    command: VerifyStepUpPasskeyCommand,
  ): Promise<HandleResult<auth.StepUpResponse>> {
    if (command.challengeUserId !== command.userId) throw new PasskeyChallengeInvalidError();

    const response = command.response as AuthenticationResponseJSON;
    const stored = await this.passkeys.findByCredentialId(response?.id ?? "");
    if (!stored || stored.userId !== command.userId) throw new InvalidCredentialsError();

    const credential: WebAuthnCredential = {
      id: stored.credentialId,
      publicKey: isoBase64URL.toBuffer(stored.publicKey),
      counter: stored.counter,
      transports: stored.transports as WebAuthnCredential["transports"],
    };

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: command.expectedChallenge,
        expectedOrigin: getPasskeyExpectedOrigin(this.config),
        expectedRPID: getPasskeyRpId(this.config),
        credential,
      });
    } catch {
      throw new InvalidCredentialsError();
    }
    if (!verification.verified) throw new InvalidCredentialsError();

    const now = new Date();
    await this.passkeys.updateCounterAndLastUsedWithTx(
      this.prisma,
      stored.id,
      verification.authenticationInfo.newCounter,
      now,
    );
    await this.stepUp.markSteppedUp(command.userId, command.sessionId, now);
    return { result: { verifiedUntil: stepUpExpiry(now).toISOString() }, events: [] };
  }
}
