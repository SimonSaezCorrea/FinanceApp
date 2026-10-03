import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type {
  AuthenticatorTransportFuture,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";

import { getPasskeyRpId } from "../../../../infra/config/passkey.config";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import { StepUpMethodNotAllowedError } from "../../domain/errors";
import { StartStepUpPasskeyCommand } from "./start-step-up-passkey.command";

/**
 * Step-up by passkey, step 1 (2026-09-25): WebAuthn options limited to the caller's own passkeys
 * (`allowCredentials`), so the browser can't offer a different account's key. The controller
 * seals the challenge in a short-lived cookie together with the user id, same mechanism as the
 * passkey login. No passkeys at all is `STEP_UP_METHOD_NOT_ALLOWED` — there is nothing to prove.
 */
@Injectable()
@CommandHandler(StartStepUpPasskeyCommand)
export class StartStepUpPasskeyHandler extends BaseCommandHandler<
  StartStepUpPasskeyCommand,
  PublicKeyCredentialRequestOptionsJSON,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
    private readonly config: ConfigService,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(
    command: StartStepUpPasskeyCommand,
  ): Promise<HandleResult<PublicKeyCredentialRequestOptionsJSON>> {
    const existing = await this.passkeys.findByUserId(command.userId);
    if (existing.length === 0) throw new StepUpMethodNotAllowedError();
    const options = await generateAuthenticationOptions({
      rpID: getPasskeyRpId(this.config),
      userVerification: "preferred",
      allowCredentials: existing.map((p) => ({
        id: p.credentialId,
        transports: p.transports as AuthenticatorTransportFuture[],
      })),
    });
    return { result: options, events: [] };
  }
}
