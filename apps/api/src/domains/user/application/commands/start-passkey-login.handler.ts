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
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { StartPasskeyLoginCommand } from "./start-passkey-login.command";

/** Internal result — richer than the HTTP contract's `{options}`: the controller reads `userId`
 * to seal it (possibly `null`) into the challenge cookie, never into the response body
 * (FR-005a, no user-enumeration). */
export interface StartPasskeyLoginResult {
  options: PublicKeyCredentialRequestOptionsJSON;
  userId: string | null;
  discoverable: boolean;
}

@Injectable()
@CommandHandler(StartPasskeyLoginCommand)
export class StartPasskeyLoginHandler extends BaseCommandHandler<
  StartPasskeyLoginCommand,
  StartPasskeyLoginResult,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepositoryPort,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
    private readonly config: ConfigService,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(
    command: StartPasskeyLoginCommand,
  ): Promise<HandleResult<StartPasskeyLoginResult>> {
    // No email at all: discoverable/"usernameless" flow — leave allowCredentials unset so the
    // browser offers any resident passkey for this site's rpID on its own, account unresolved
    // until the user actually picks one (verify resolves it from the credential itself).
    if (!command.email) {
      const options = await generateAuthenticationOptions({
        rpID: getPasskeyRpId(this.config),
        userVerification: "preferred",
      });
      return { result: { options, userId: null, discoverable: true }, events: [] };
    }

    const user = await this.userRepo.findByEmail(command.email.toLowerCase());
    const existing = user ? await this.passkeys.findByUserId(user.id) : [];

    // Same shape whether the email doesn't exist or simply has no passkeys — an empty
    // allowCredentials list is indistinguishable from either case to the caller.
    const options = await generateAuthenticationOptions({
      rpID: getPasskeyRpId(this.config),
      userVerification: "preferred",
      allowCredentials: existing.map((p) => ({
        id: p.credentialId,
        transports: p.transports as AuthenticatorTransportFuture[],
      })),
    });

    return {
      result: {
        options,
        userId: existing.length > 0 && user ? user.id : null,
        discoverable: false,
      },
      events: [],
    };
  }
}
