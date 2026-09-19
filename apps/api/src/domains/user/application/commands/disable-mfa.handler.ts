import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { compare } from "bcryptjs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  MFA_RECOVERY_CODE_REPOSITORY,
  type MfaRecoveryCodeRepositoryPort,
} from "../../../mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import { InvalidCurrentPasswordError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { DisableMfaCommand } from "./disable-mfa.command";

interface Context {
  user: User;
  currentSessionId: string;
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
    return { user, currentSessionId: command.currentSessionId };
  }

  protected async handle(
    _command: DisableMfaCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    context.user.disableMfa();
    return { result: undefined, events: [] };
  }

  protected override async persist(context: Context): Promise<void> {
    // Two aggregates (User + every MfaRecoveryCode row) must clear atomically — a crash between
    // the two would otherwise leave stale recovery codes usable after MFA looks disabled.
    // specs/024 adds a third: closing every other session inside the SAME transaction, since
    // disabling MFA is a signal the user wants to invalidate earlier access too (FR-007).
    await this.prisma.$transaction(async (tx) => {
      await this.repo.saveWithTx(tx, context.user);
      await this.recoveryCodes.deleteAllForUserWithTx(tx, context.user.id);
      await this.sessions.closeAllExceptForUserWithTx(
        tx,
        context.user.id,
        context.currentSessionId,
      );
    });
  }
}
