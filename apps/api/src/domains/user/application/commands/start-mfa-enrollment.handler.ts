import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import * as OTPAuth from "otpauth";
import * as QRCode from "qrcode";

import type { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { User } from "../../domain/user.aggregate";
import {
  MfaEmailNotVerifiedError,
  MfaSameMethodError,
  StepUpRequiredError,
  UnauthorizedError,
} from "../../domain/errors";
import {
  SESSION_STEP_UP,
  type SessionStepUpPort,
} from "../../../session/domain/ports/session-step-up.port";
import { MfaCodeService } from "../mfa-code-service";
import { assertRecentStepUp } from "../step-up";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { StartMfaEnrollmentCommand } from "./start-mfa-enrollment.command";

const ISSUER = "mifik";

@Injectable()
@CommandHandler(StartMfaEnrollmentCommand)
export class StartMfaEnrollmentHandler extends BaseCommandHandler<
  StartMfaEnrollmentCommand,
  auth.StartMfaEnrollmentResponse,
  User
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(SESSION_STEP_UP) private readonly stepUp: SessionStepUpPort,
    private readonly mfaCodes: MfaCodeService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: StartMfaEnrollmentCommand): Promise<User> {
    const user = await this.repo.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    return user;
  }

  protected async handle(
    command: StartMfaEnrollmentCommand,
    user: User,
  ): Promise<HandleResult<auth.StartMfaEnrollmentResponse>> {
    const method = command.input.method === "email" ? "EMAIL" : "TOTP";
    if (user.mfaEnabled) {
      if (user.mfaMethodOrDefault() === method) throw new MfaSameMethodError();
      // A CHANGE of method (specs/040 R12): a stolen session must not be able to move the second
      // factor somewhere the attacker controls.
      if (!command.sessionId) throw new StepUpRequiredError();
      await assertRecentStepUp(this.stepUp, user.id, command.sessionId);
    }

    if (method === "EMAIL") {
      if (!user.email || !user.emailVerified) throw new MfaEmailNotVerifiedError();
      user.startMfaEnrollment("EMAIL");
      // Sent before the pending method is saved: if it can't go out, nothing changes.
      await this.mfaCodes.issueAndSendOrThrow(
        {
          userId: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          locale: user.locale,
        },
        "ENROLL",
      );
      return { result: { method: "email", codeSent: true }, events: [] };
    }

    const secret = new OTPAuth.Secret({ size: 20 });
    user.startMfaEnrollment("TOTP", secret.base32);
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: user.email ?? user.id,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(totp.toString());
    return { result: { method: "totp", qrCodeDataUrl, secret: secret.base32 }, events: [] };
  }

  protected override async persist(user: User): Promise<void> {
    await this.repo.save(user);
  }
}
