import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import * as OTPAuth from "otpauth";
import * as QRCode from "qrcode";

import type { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { User } from "../../domain/user.aggregate";
import { UnauthorizedError } from "../../domain/errors";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { StartMfaEnrollmentCommand } from "./start-mfa-enrollment.command";

const ISSUER = "Cuadra";

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
    const secret = new OTPAuth.Secret({ size: 20 });
    // Throws MfaAlreadyEnabledError if MFA is already active — no "replace device" path.
    user.startMfaEnrollment(secret.base32);
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: user.email ?? user.id,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(totp.toString());
    return { result: { qrCodeDataUrl, secret: secret.base32 }, events: [] };
  }

  protected override async persist(user: User): Promise<void> {
    await this.repo.save(user);
  }
}
