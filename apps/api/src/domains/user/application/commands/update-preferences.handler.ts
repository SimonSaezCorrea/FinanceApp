import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { UnauthorizedError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { UpdatePreferencesCommand } from "./update-preferences.command";

@Injectable()
@CommandHandler(UpdatePreferencesCommand)
export class UpdatePreferencesHandler extends BaseCommandHandler<UpdatePreferencesCommand, auth.CurrentUser, User> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdatePreferencesCommand): Promise<User> {
    const user = await this.repo.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    return user;
  }

  protected async handle(command: UpdatePreferencesCommand, user: User): Promise<HandleResult<auth.CurrentUser>> {
    user.applyPreferencesUpdate(command.input);
    return { result: user.toContract(), events: [] };
  }

  protected override async persist(user: User): Promise<void> {
    await this.repo.save(user);
  }
}
