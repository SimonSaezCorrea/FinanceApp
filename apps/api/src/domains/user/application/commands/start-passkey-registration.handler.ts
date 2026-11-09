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
import {
  SESSION_STEP_UP,
  type SessionStepUpPort,
} from "../../../session/domain/ports/session-step-up.port";
import { StepUpRequiredError, UnauthorizedError } from "../../domain/errors";
import { assertRecentStepUp } from "../step-up";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { StartPasskeyRegistrationCommand } from "./start-passkey-registration.command";

const RP_NAME = "mifik";

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
    @Inject(SESSION_STEP_UP) private readonly stepUp: SessionStepUpPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: StartPasskeyRegistrationCommand): Promise<User> {
    const user = await this.repo.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    // A passkey signs in without password or second factor and counts as a step-up method, so a
    // session that only holds a cookie must prove itself before adding one (GHSA-jhp2-jfjr-fqfq).
    if (!command.sessionId) throw new StepUpRequiredError();
    await assertRecentStepUp(this.stepUp, user.id, command.sessionId);
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
      // specs/041: ask for the maker's attestation, never require it — synced passkeys answer
      // "none" and register exactly as before.
      attestationType: "direct",
      excludeCredentials: existing.map((p) => ({
        id: p.credentialId,
        transports: p.transports as AuthenticatorTransportFuture[],
      })),
    });
    return { result: { options }, events: [] };
  }
}
