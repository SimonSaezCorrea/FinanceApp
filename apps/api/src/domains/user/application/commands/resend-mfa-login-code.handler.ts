import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { MfaLockedError, MfaNotEnabledError, UnauthorizedError } from "../../domain/errors";
import type { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { MfaCodeService } from "../mfa-code-service";
import { ResendMfaLoginCodeCommand } from "./resend-mfa-login-code.command";

/**
 * Sends a new LOGIN code to an account whose second factor is email (specs/040). Replaces the
 * previous one; limited to one a minute and five an hour (`MFA_CODE_RATE_LIMITED`). A locked
 * account gets nothing until the lock passes.
 */
@Injectable()
@CommandHandler(ResendMfaLoginCodeCommand)
export class ResendMfaLoginCodeHandler extends BaseCommandHandler<
  ResendMfaLoginCodeCommand,
  auth.MfaCodeSentResponse,
  User
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly mfaCodes: MfaCodeService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: ResendMfaLoginCodeCommand): Promise<User> {
    const user = await this.users.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    user.assertActive();
    if (user.mfaMethodOrDefault() !== "EMAIL") throw new MfaNotEnabledError();
    if (user.isMfaLocked(new Date())) throw new MfaLockedError();
    return user;
  }

  protected async handle(
    _command: ResendMfaLoginCodeCommand,
    user: User,
  ): Promise<HandleResult<auth.MfaCodeSentResponse>> {
    await this.mfaCodes.issueAndSendOrThrow(
      {
        userId: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        locale: user.locale,
      },
      "LOGIN",
    );
    return { result: { codeSent: true }, events: [] };
  }
}
