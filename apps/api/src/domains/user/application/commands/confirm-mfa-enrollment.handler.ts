import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { hash } from "bcryptjs";
import * as OTPAuth from "otpauth";

import type { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  MFA_RECOVERY_CODE_REPOSITORY,
  type MfaRecoveryCodeRepositoryPort,
} from "../../../mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";
import {
  InvalidMfaCodeError,
  MfaAlreadyEnabledError,
  MfaNotPendingError,
  UnauthorizedError,
} from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { generateRecoveryCodes } from "../recovery-code-generator";
import { ConfirmMfaEnrollmentCommand } from "./confirm-mfa-enrollment.command";

interface Context {
  user: User;
  /** Set inside `handle()` once the code validates — read back by `persist()`, which runs after
   * `handle()` returns but shares this same object by reference. */
  recoveryCodeHashes?: string[];
}

const RECOVERY_CODE_BCRYPT_ROUNDS = 10;

@Injectable()
@CommandHandler(ConfirmMfaEnrollmentCommand)
export class ConfirmMfaEnrollmentHandler extends BaseCommandHandler<
  ConfirmMfaEnrollmentCommand,
  auth.ConfirmMfaEnrollmentResponse,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(MFA_RECOVERY_CODE_REPOSITORY)
    private readonly recoveryCodes: MfaRecoveryCodeRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: ConfirmMfaEnrollmentCommand): Promise<Context> {
    const user = await this.repo.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    return { user };
  }

  protected async handle(
    command: ConfirmMfaEnrollmentCommand,
    context: Context,
  ): Promise<HandleResult<auth.ConfirmMfaEnrollmentResponse>> {
    const { user } = context;
    // Checked before evaluating any code: already active has no "replace device" path (must
    // disable first), and with nothing pending there is no secret to validate against.
    if (user.mfaEnabled) throw new MfaAlreadyEnabledError();
    if (!user.mfaSecret) throw new MfaNotPendingError();
    const totp = new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.mfaSecret ?? ""),
    });
    const delta = totp.validate({ token: command.input.code.trim(), window: 1 });
    if (delta === null) throw new InvalidMfaCodeError();

    user.confirmMfaEnrollment();

    const plainCodes = generateRecoveryCodes();
    context.recoveryCodeHashes = await Promise.all(
      plainCodes.map((code) => hash(code, RECOVERY_CODE_BCRYPT_ROUNDS)),
    );
    return { result: { recoveryCodes: plainCodes }, events: [] };
  }

  protected override async persist(context: Context): Promise<void> {
    const hashes = context.recoveryCodeHashes ?? [];
    await this.prisma.$transaction(async (tx) => {
      await this.repo.saveWithTx(tx, context.user);
      await this.recoveryCodes.createManyWithTx(tx, context.user.id, hashes);
    });
  }
}
