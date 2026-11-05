import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { StepUpMethodNotAllowedError, UnauthorizedError } from "../../domain/errors";
import type { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { MfaCodeService } from "../mfa-code-service";
import { SendStepUpEmailCodeCommand } from "./send-step-up-email-code.command";

/** Sends a STEP_UP code to an account whose second factor is email (specs/040 R13). */
@Injectable()
@CommandHandler(SendStepUpEmailCodeCommand)
export class SendStepUpEmailCodeHandler extends BaseCommandHandler<
  SendStepUpEmailCodeCommand,
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

  protected async loadContext(command: SendStepUpEmailCodeCommand): Promise<User> {
    const user = await this.users.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    if (user.mfaMethodOrDefault() !== "EMAIL") throw new StepUpMethodNotAllowedError();
    return user;
  }

  protected async handle(
    _command: SendStepUpEmailCodeCommand,
    user: User,
  ): Promise<HandleResult<auth.MfaCodeSentResponse>> {
    await this.mfaCodes.issueAndSendOrThrow(
      {
        userId: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        locale: user.locale,
      },
      "STEP_UP",
    );
    return { result: { codeSent: true }, events: [] };
  }
}
