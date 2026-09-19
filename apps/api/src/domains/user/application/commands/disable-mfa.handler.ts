import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { compare } from "bcryptjs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  MFA_RECOVERY_CODE_REPOSITORY,
  type MfaRecoveryCodeRepositoryPort,
} from "../../../mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";
import { InvalidCurrentPasswordError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { DisableMfaCommand } from "./disable-mfa.command";

@Injectable()
@CommandHandler(DisableMfaCommand)
export class DisableMfaHandler extends BaseCommandHandler<DisableMfaCommand, void, User> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(MFA_RECOVERY_CODE_REPOSITORY)
    private readonly recoveryCodes: MfaRecoveryCodeRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: DisableMfaCommand): Promise<User> {
    const user = await this.repo.findById(command.userId);
    // Same guard "Eliminar cuenta" already uses: re-entering the current password is what
    // authorizes this, not merely holding a valid session.
    if (!user?.passwordHash || !(await compare(command.input.password, user.passwordHash))) {
      throw new InvalidCurrentPasswordError();
    }
    return user;
  }

  protected async handle(_command: DisableMfaCommand, user: User): Promise<HandleResult<void>> {
    user.disableMfa();
    return { result: undefined, events: [] };
  }

  protected override async persist(user: User): Promise<void> {
    // Two aggregates (User + every MfaRecoveryCode row) must clear atomically — a crash between
    // the two would otherwise leave stale recovery codes usable after MFA looks disabled.
    await this.prisma.$transaction(async (tx) => {
      await this.repo.saveWithTx(tx, user);
      await this.recoveryCodes.deleteAllForUserWithTx(tx, user.id);
    });
  }
}
