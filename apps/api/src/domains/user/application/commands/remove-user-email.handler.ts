import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  USER_EMAIL_REPOSITORY,
  type UserEmailRepositoryPort,
} from "../../../user-email/domain/ports/user-email.repository.port";
import { isDeletable } from "../../../user-email/domain/user-email.entity";
import { EmailNotFoundError, EmailPrimaryNotDeletableError } from "../../domain/errors";
import { RemoveUserEmailCommand } from "./remove-user-email.command";

/** Deletes an address from the account's list (specs/032 FR-012c). Ownership is part of the
 * lookup itself (another account's id is a 404, never a 403); the primary can't go. A deleted
 * pending address takes its confirmation link with it (FK cascade). Deleting twice: the second
 * time is a 404 with no effect (Principle VII form a). */
@Injectable()
@CommandHandler(RemoveUserEmailCommand)
export class RemoveUserEmailHandler extends BaseCommandHandler<RemoveUserEmailCommand, void, void> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_EMAIL_REPOSITORY) private readonly emails: UserEmailRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RemoveUserEmailCommand): Promise<void> {
    const email = await this.emails.findOwned(command.userId, command.userEmailId);
    if (!email) throw new EmailNotFoundError();
    if (!isDeletable(email)) throw new EmailPrimaryNotDeletableError();
  }

  protected async handle(command: RemoveUserEmailCommand): Promise<HandleResult<void>> {
    const removed = await this.emails.removeOwned(command.userId, command.userEmailId);
    if (!removed) throw new EmailNotFoundError();
    return { result: undefined, events: [] };
  }
}
