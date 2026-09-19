import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON, WebAuthnCredential } from "@simplewebauthn/server";

import { getPasskeyExpectedOrigin, getPasskeyRpId } from "../../../../infra/config/passkey.config";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import { InvalidCredentialsError } from "../../domain/errors";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { TokenIssuer } from "../token-issuer";
import type { AuthResult } from "./register.handler";
import { VerifyPasskeyLoginCommand } from "./verify-passkey-login.command";

@Injectable()
@CommandHandler(VerifyPasskeyLoginCommand)
export class VerifyPasskeyLoginHandler extends BaseCommandHandler<
  VerifyPasskeyLoginCommand,
  AuthResult,
  null
> {
  private readonly logger = new Logger(VerifyPasskeyLoginHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepositoryPort,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
    private readonly tokenIssuer: TokenIssuer,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: VerifyPasskeyLoginCommand): Promise<HandleResult<AuthResult>> {
    // Non-discoverable (an email was typed) and it resolved to no passkeys — same generic
    // rejection as any other invalid attempt, never a different error (FR-005a).
    if (!command.userId && !command.discoverable) throw new InvalidCredentialsError();

    const response = command.response as AuthenticationResponseJSON;
    const stored = await this.passkeys.findByCredentialId(response.id);
    if (!stored) throw new InvalidCredentialsError();
    // Non-discoverable: the credential must belong to the user the cookie was pre-sealed for —
    // defense in depth against a response for a different account's credential. Discoverable:
    // there was nothing to pre-seal, so the credential's own owner IS the resolved account —
    // guessing a valid credentialId is cryptographically infeasible either way.
    if (command.userId && stored.userId !== command.userId) throw new InvalidCredentialsError();
    const resolvedUserId = command.userId ?? stored.userId;

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

    const user = await this.userRepo.findById(resolvedUserId);
    if (!user) throw new InvalidCredentialsError();

    await this.passkeys.updateCounterAndLastUsedWithTx(
      this.prisma,
      stored.id,
      verification.authenticationInfo.newCounter,
      new Date(),
    );

    this.logger.log(`passkey login: ${user.id}`);
    const tokens = this.tokenIssuer.issue({ id: user.id, email: user.email });
    // Never routes through mfa_pending_token / VerifyMfaLoginCommand, even if user.mfaEnabled —
    // the passkey is its own strong authentication (specs/022 FR-007).
    return { result: { tokens, user: user.toContract() }, events: [] };
  }
}
