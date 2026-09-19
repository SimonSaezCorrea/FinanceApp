import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { compare, hash } from "bcryptjs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import { InvalidCurrentPasswordError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { ChangePasswordCommand } from "./change-password.command";

interface Context {
  user: User;
  currentSessionId: string;
}

@Injectable()
@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler extends BaseCommandHandler<
  ChangePasswordCommand,
  void,
  Context
> {
  private readonly logger = new Logger(ChangePasswordHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: ChangePasswordCommand): Promise<Context> {
    const user = await this.repo.findById(command.userId);
    if (!user?.passwordHash || !(await compare(command.input.currentPassword, user.passwordHash))) {
      throw new InvalidCurrentPasswordError();
    }
    return { user, currentSessionId: command.currentSessionId };
  }

  protected async handle(
    command: ChangePasswordCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    context.user.changePasswordHash(await hash(command.input.newPassword, 12));
    this.logger.log(`password changed: ${command.userId}`);
    return { result: undefined, events: [] };
  }

  /** A password change is a signal the user wants to invalidate earlier access
   * (specs/024) — closing every other session runs in the SAME transaction as the
   * new hash, so a failure here rolls back the credential change too (FR-007). */
  protected override async persist(context: Context): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.repo.saveWithTx(tx, context.user);
      await this.sessions.closeAllExceptForUserWithTx(
        tx,
        context.user.id,
        context.currentSessionId,
      );
    });
  }
}
