import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { ConfigService } from "@nestjs/config";
import { compare } from "bcryptjs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  getIdentifierHashSecret,
  hashIdentifier,
} from "../../../../infra/config/identifier-hash.config";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  ACCOUNT_DELETION_LOG_REPOSITORY,
  type AccountDeletionLogRepositoryPort,
} from "../../../account-deletion-log/domain/ports/account-deletion-log.repository.port";
import { InvalidCurrentPasswordError } from "../../domain/errors";
import { AccountSecurityEvent } from "../../domain/events/account-security.event";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { DeleteAccountCommand } from "./delete-account.command";

interface Context {
  user: User;
  /** Captured BEFORE `handle()` scrubs the aggregate — the only chance to hash it for the
   * compliance log. Never persisted anywhere in the clear past this point. */
  identifierValueAtRequest: string | null;
  /** Same reason: the address (and its language/confirmation) the deletion notice goes to, read
   * before the row loses it (specs/032). */
  emailAtRequest: { address: string; locale: string; verified: boolean } | null;
}

@Injectable()
@CommandHandler(DeleteAccountCommand)
export class DeleteAccountHandler extends BaseCommandHandler<DeleteAccountCommand, void, Context> {
  private readonly logger = new Logger(DeleteAccountHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(ACCOUNT_DELETION_LOG_REPOSITORY)
    private readonly deletionLog: AccountDeletionLogRepositoryPort,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: DeleteAccountCommand): Promise<Context> {
    const user = await this.repo.findById(command.userId);
    if (!user?.passwordHash || !(await compare(command.input.password, user.passwordHash))) {
      throw new InvalidCurrentPasswordError();
    }
    return {
      user,
      identifierValueAtRequest: user.identifierValue,
      emailAtRequest: user.email
        ? { address: user.email, locale: user.locale, verified: user.emailVerified }
        : null,
    };
  }

  protected async handle(
    _command: DeleteAccountCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    // Only marks the in-memory aggregate deleted and yields its event: `persist()` below deletes
    // the row itself, never saves this copy.
    const event = context.user.delete();
    this.logger.log(`account deleted: ${context.user.id}`);
    const events: object[] = event ? [event] : [];
    // The goodbye notice (specs/032 FR-021) goes to the address the account had; the listener
    // applies the "confirmed only" rule.
    if (event && context.emailAtRequest) {
      events.push(
        new AccountSecurityEvent(
          context.user.id,
          "ACCOUNT_DELETED",
          new Date(),
          undefined,
          context.emailAtRequest,
        ),
      );
    }
    return { result: undefined, events };
  }

  protected override async persist(context: Context): Promise<void> {
    const identifierHash = context.identifierValueAtRequest
      ? hashIdentifier(context.identifierValueAtRequest, getIdentifierHashSecret(this.config))
      : null;

    await this.prisma.$transaction(async (tx) => {
      // Always a hard delete (the "keep an anonymized history" option was removed 2026-10-14):
      // removing the User row cascades to every table via its own `onDelete: Cascade` on
      // `userId` — sessions, passkeys, recovery codes, addresses and every financial row.
      await this.repo.deleteWithTx(tx, context.user.id);
      // Compliance evidence — see `AccountDeletionLog`'s doc-comment for why this never carries
      // a raw identifier or an FK to `User`. `keepHistory` is always false now (column kept for
      // the rows written before).
      await this.deletionLog.createWithTx(tx, false, identifierHash);
    });
  }
}
