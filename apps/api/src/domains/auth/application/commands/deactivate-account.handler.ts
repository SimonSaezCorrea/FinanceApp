import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { compare } from "bcryptjs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InvalidCurrentPasswordError } from "../../domain/errors";
import type { UserDeactivatedEvent } from "../../domain/events/user-deactivated.event";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { DeactivateAccountCommand } from "./deactivate-account.command";

@Injectable()
@CommandHandler(DeactivateAccountCommand)
export class DeactivateAccountHandler extends BaseCommandHandler<DeactivateAccountCommand, void, User> {
  private readonly logger = new Logger(DeactivateAccountHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: DeactivateAccountCommand): Promise<User> {
    const user = await this.repo.findById(command.userId);
    if (!user?.passwordHash || !(await compare(command.input.password, user.passwordHash))) {
      throw new InvalidCurrentPasswordError();
    }
    return user;
  }

  protected async handle(command: DeactivateAccountCommand, user: User): Promise<HandleResult<void>> {
    const event = user.deactivate();
    this.logger.log(`account deactivated: ${command.userId}`);
    const events: UserDeactivatedEvent[] = event ? [event] : [];
    return { result: undefined, events };
  }

  protected override async persist(user: User): Promise<void> {
    await this.repo.save(user);
  }
}
