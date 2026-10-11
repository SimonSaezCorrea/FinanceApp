import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { UnauthorizedError } from "../../domain/errors";
import type { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { CloseOnboardingCommand } from "./close-onboarding.command";

interface Context {
  user: User;
  changed: boolean;
}

/**
 * Closes the first-steps guide for good, on every device (2026-10-11) — whether the person
 * finished the three steps or closed it. Kept on the account, not the browser: closing it on one
 * device used to leave it showing on the others. Repeating it keeps the first date and writes
 * nothing (Principle VII form a).
 */
@Injectable()
@CommandHandler(CloseOnboardingCommand)
export class CloseOnboardingHandler extends BaseCommandHandler<
  CloseOnboardingCommand,
  void,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CloseOnboardingCommand): Promise<Context> {
    const user = await this.repo.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    return { user, changed: false };
  }

  protected async handle(
    _command: CloseOnboardingCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    context.changed = context.user.closeOnboarding(new Date());
    return { result: undefined, events: [] };
  }

  protected override async persist(context: Context): Promise<void> {
    if (context.changed) await this.repo.save(context.user);
  }
}
