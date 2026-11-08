import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { compare } from "bcryptjs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  TRUSTED_DEVICE_REPOSITORY,
  type TrustedDeviceRepositoryPort,
} from "../../../trusted-device/domain/ports/trusted-device.repository.port";
import {
  MFA_RECOVERY_CODE_REPOSITORY,
  type MfaRecoveryCodeRepositoryPort,
} from "../../../mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import {
  SESSION_STEP_UP,
  type SessionStepUpPort,
} from "../../../session/domain/ports/session-step-up.port";
import { InvalidCurrentPasswordError, StepUpRequiredError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { stepUpExpiry } from "../step-up";
import { DisableMfaCommand } from "./disable-mfa.command";
import { AccountSecurityEvent } from "../../domain/events/account-security.event";

interface Context {
  user: User;
  currentSessionId: string;
  /** The step-up this request spends — the conditional clear must still find it. */
  steppedUpAt: Date;
}

@Injectable()
@CommandHandler(DisableMfaCommand)
export class DisableMfaHandler extends BaseCommandHandler<DisableMfaCommand, void, Context> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(MFA_RECOVERY_CODE_REPOSITORY)
    private readonly recoveryCodes: MfaRecoveryCodeRepositoryPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    private readonly prisma: PrismaService,
    @Inject(TRUSTED_DEVICE_REPOSITORY) private readonly devices: TrustedDeviceRepositoryPort,
    @Inject(SESSION_STEP_UP) private readonly stepUp: SessionStepUpPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: DisableMfaCommand): Promise<Context> {
    const user = await this.repo.findById(command.userId);
    // Same guard "Eliminar cuenta" already uses: re-entering the current password is what
    // authorizes this, not merely holding a valid session.
    if (!user?.passwordHash || !(await compare(command.input.password, user.passwordHash))) {
      throw new InvalidCurrentPasswordError();
    }
    // The password alone is not enough (2026-11-08): with the session and the password, someone
    // could turn MFA off and enrol their own method, skipping the step-up a method CHANGE asks
    // for. So disabling also needs a recent step-up of this session — with MFA on that is the
    // second factor or a passkey, never the password — and spends it, like new recovery codes.
    const steppedUpAt = await this.stepUp.steppedUpAt(user.id, command.currentSessionId);
    if (!steppedUpAt || stepUpExpiry(steppedUpAt).getTime() <= Date.now()) {
      throw new StepUpRequiredError();
    }
    return { user, currentSessionId: command.currentSessionId, steppedUpAt };
  }

  protected async handle(
    _command: DisableMfaCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    context.user.disableMfa();
    return {
      result: undefined,
      events: [new AccountSecurityEvent(context.user.id, "MFA_DISABLED", new Date())],
    };
  }

  protected override async persist(context: Context): Promise<void> {
    // Two aggregates (User + every MfaRecoveryCode row) must clear atomically — a crash between
    // the two would otherwise leave stale recovery codes usable after MFA looks disabled.
    // specs/024 adds a third: closing every other session inside the SAME transaction, since
    // disabling MFA is a signal the user wants to invalidate earlier access too (FR-007).
    await this.prisma.$transaction(async (tx) => {
      const spent = await this.stepUp.consumeWithTx(
        tx,
        context.user.id,
        context.currentSessionId,
        context.steppedUpAt,
      );
      if (!spent) throw new StepUpRequiredError();
      await this.repo.saveWithTx(tx, context.user);
      await this.recoveryCodes.deleteAllForUserWithTx(tx, context.user.id);
      await this.sessions.closeAllExceptForUserWithTx(
        tx,
        context.user.id,
        context.currentSessionId,
      );
      // specs/040: without a second factor there is nothing for a device to skip.
      await this.devices.deleteAllForUserWithTx(tx, context.user.id);
    });
  }
}
