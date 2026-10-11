import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { AccountEmailService } from "../account-emails";
import { ForgotPasswordCommand } from "./forgot-password.command";

/**
 * Starts a password recovery (specs/032 US2). The answer never says whether the account exists
 * (FR-016, SC-003): this handler returns at once and does the real work — find the account by
 * RUT, require an ACTIVE account with a CONFIRMED email, apply the hourly cap, send the link —
 * in the background, so neither the body nor the time of the response tells anything apart
 * (research.md R9). Retry-safe by the token table's partial unique index (Principle VII form b).
 */
@Injectable()
@CommandHandler(ForgotPasswordCommand)
export class ForgotPasswordHandler extends BaseCommandHandler<ForgotPasswordCommand, void, void> {
  private readonly logger = new Logger(ForgotPasswordHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly accountEmails: AccountEmailService,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<void> {
    // Nothing is read before answering.
  }

  protected async handle(command: ForgotPasswordCommand): Promise<HandleResult<void>> {
    void this.recover(command.identifierValue).catch((err: unknown) =>
      this.logger.error(`Password recovery failed: ${String(err)}`),
    );
    return { result: undefined, events: [] };
  }

  /** Exposed for tests: the same work `handle` starts in the background. */
  async recover(identifierValue: string): Promise<void> {
    const user = await this.users.findByIdentifierValue(auth.normalizeRut(identifierValue));
    if (!user?.email || !user.emailVerified || user.status !== "ACTIVE") return;
    await this.accountEmails.sendPasswordReset(
      { userId: user.id, locale: user.locale },
      user.email,
    );
  }
}
