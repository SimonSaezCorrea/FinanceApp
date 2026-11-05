import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { hash } from "bcryptjs";

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
import { isValidTotp } from "../totp";
import { MfaCodeService } from "../mfa-code-service";
import {
  TRUSTED_DEVICE_REPOSITORY,
  type TrustedDeviceRepositoryPort,
} from "../../../trusted-device/domain/ports/trusted-device.repository.port";
import { ConfirmMfaEnrollmentCommand } from "./confirm-mfa-enrollment.command";
import { AccountSecurityEvent } from "../../domain/events/account-security.event";

interface Context {
  user: User;
  /** Set inside `handle()` once the code validates — read back by `persist()`, which runs after
   * `handle()` returns but shares this same object by reference. */
  recoveryCodeHashes?: string[];
  /** Set when this confirmed a METHOD CHANGE: remembered devices are forgotten in `persist()`. */
  changed?: boolean;
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
    @Inject(TRUSTED_DEVICE_REPOSITORY) private readonly devices: TrustedDeviceRepositoryPort,
    private readonly mfaCodes: MfaCodeService,
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
    // Checked before evaluating any code. A pending TOTP secret from before specs/040 (no pending
    // method) still confirms as the app.
    const pending = user.mfaPendingMethod ?? (!user.mfaEnabled && user.mfaSecret ? "TOTP" : null);
    if (!pending) {
      if (user.mfaEnabled) throw new MfaAlreadyEnabledError();
      throw new MfaNotPendingError();
    }
    const code = command.input.code.trim();
    const valid =
      pending === "EMAIL"
        ? await this.prisma.$transaction((tx) =>
            this.mfaCodes.verifyWithTx(tx, user.id, "ENROLL", code),
          )
        : isValidTotp(user.mfaSecret, code);
    if (!valid) throw new InvalidMfaCodeError();

    const outcome = user.confirmMfaEnrollment();
    const now = new Date();
    if (outcome === "CHANGED") {
      // The recovery codes stay; remembered devices were trusted under the old method.
      context.changed = true;
      return {
        result: { recoveryCodes: null },
        events: [new AccountSecurityEvent(user.id, "MFA_METHOD_CHANGED", now)],
      };
    }

    const plainCodes = generateRecoveryCodes();
    context.recoveryCodeHashes = await Promise.all(
      plainCodes.map((c) => hash(c, RECOVERY_CODE_BCRYPT_ROUNDS)),
    );
    return {
      result: { recoveryCodes: plainCodes },
      events: [new AccountSecurityEvent(user.id, "MFA_ENABLED", now)],
    };
  }

  protected override async persist(context: Context): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.repo.saveWithTx(tx, context.user);
      if (context.changed) {
        await this.devices.deleteAllForUserWithTx(tx, context.user.id);
      } else {
        await this.recoveryCodes.createManyWithTx(
          tx,
          context.user.id,
          context.recoveryCodeHashes ?? [],
        );
      }
    });
  }
}
