import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { compare, hash } from "bcryptjs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InvalidCurrentPasswordError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { ChangePasswordCommand } from "./change-password.command";

@Injectable()
@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler extends BaseCommandHandler<ChangePasswordCommand, void, User> {
  private readonly logger = new Logger(ChangePasswordHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: ChangePasswordCommand): Promise<User> {
    const user = await this.repo.findById(command.userId);
    if (!user?.passwordHash || !(await compare(command.input.currentPassword, user.passwordHash))) {
      throw new InvalidCurrentPasswordError();
    }
    return user;
  }

  protected async handle(command: ChangePasswordCommand, user: User): Promise<HandleResult<void>> {
    user.changePasswordHash(await hash(command.input.newPassword, 12));
    this.logger.log(`password changed: ${command.userId}`);
    return { result: undefined, events: [] };
  }

  protected override async persist(user: User): Promise<void> {
    await this.repo.save(user);
  }
}
