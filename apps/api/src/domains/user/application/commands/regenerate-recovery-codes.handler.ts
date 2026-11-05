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
  SESSION_STEP_UP,
  type SessionStepUpPort,
} from "../../../session/domain/ports/session-step-up.port";
import {
  TRUSTED_DEVICE_REPOSITORY,
  type TrustedDeviceRepositoryPort,
} from "../../../trusted-device/domain/ports/trusted-device.repository.port";
import { MfaNotEnabledError, StepUpRequiredError, UnauthorizedError } from "../../domain/errors";
import { AccountSecurityEvent } from "../../domain/events/account-security.event";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { generateRecoveryCodes } from "../recovery-code-generator";
import { stepUpExpiry } from "../step-up";
import { RegenerateRecoveryCodesCommand } from "./regenerate-recovery-codes.command";

const RECOVERY_CODE_BCRYPT_ROUNDS = 10;

interface Context {
  userId: string;
  sessionId: string;
  /** The step-up this request spends — the conditional clear must still find it. */
  steppedUpAt: Date;
  hashes?: string[];
}

/**
 * New recovery codes without disabling MFA (specs/040 US1). Authorized by a recent step-up of the
 * caller's session, which this SPENDS: in one transaction the step-up is cleared only if it is still
 * the one read here, then the old codes are deleted and the new ones inserted, and every remembered
 * device is forgotten. A replay or a concurrent second request finds the step-up already spent and
 * gets `STEP_UP_REQUIRED` with nothing written (Constitution VII, form a) — so only ONE set of codes
 * ever exists, and it is the one shown. Plaintext codes leave only in the response.
 */
@Injectable()
@CommandHandler(RegenerateRecoveryCodesCommand)
export class RegenerateRecoveryCodesHandler extends BaseCommandHandler<
  RegenerateRecoveryCodesCommand,
  auth.RegenerateRecoveryCodesResponse,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(MFA_RECOVERY_CODE_REPOSITORY)
    private readonly recoveryCodes: MfaRecoveryCodeRepositoryPort,
    @Inject(SESSION_STEP_UP) private readonly stepUp: SessionStepUpPort,
    @Inject(TRUSTED_DEVICE_REPOSITORY) private readonly devices: TrustedDeviceRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RegenerateRecoveryCodesCommand): Promise<Context> {
    const user = await this.users.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    if (!user.mfaEnabled) throw new MfaNotEnabledError();
    const steppedUpAt = await this.stepUp.steppedUpAt(command.userId, command.sessionId);
    if (!steppedUpAt || stepUpExpiry(steppedUpAt).getTime() <= Date.now()) {
      throw new StepUpRequiredError();
    }
    return { userId: command.userId, sessionId: command.sessionId, steppedUpAt };
  }

  protected async handle(
    _command: RegenerateRecoveryCodesCommand,
    context: Context,
  ): Promise<HandleResult<auth.RegenerateRecoveryCodesResponse>> {
    const codes = generateRecoveryCodes();
    context.hashes = await Promise.all(codes.map((c) => hash(c, RECOVERY_CODE_BCRYPT_ROUNDS)));
    return {
      result: { recoveryCodes: codes },
      events: [new AccountSecurityEvent(context.userId, "RECOVERY_CODES_REGENERATED", new Date())],
    };
  }

  protected override async persist(context: Context): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const spent = await this.stepUp.consumeWithTx(
        tx,
        context.userId,
        context.sessionId,
        context.steppedUpAt,
      );
      // Nothing was written yet: throwing here rolls back nothing that matters, and the
      // events/result never leave (BaseCommandHandler publishes after persist).
      if (!spent) throw new StepUpRequiredError();
      await this.recoveryCodes.deleteAllForUserWithTx(tx, context.userId);
      await this.recoveryCodes.createManyWithTx(tx, context.userId, context.hashes ?? []);
      await this.devices.deleteAllForUserWithTx(tx, context.userId);
    });
  }
}
