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
import {
  MFA_RECOVERY_CODE_REPOSITORY,
  type MfaRecoveryCodeRepositoryPort,
} from "../../../mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import { InvalidCurrentPasswordError } from "../../domain/errors";
import type { UserAccountDeletedEvent } from "../../domain/events/user-account-deleted.event";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { DeleteAccountCommand } from "./delete-account.command";

interface Context {
  user: User;
  /** The user's own explicit choice (a checkbox, unchecked by default) — never a system
   * default. `true` anonymizes (keeps financial history under the same userId); `false`
   * hard-deletes every row this user owns, everywhere. */
  keepHistory: boolean;
  /** Captured BEFORE `handle()` scrubs the aggregate — the only chance to hash it for the
   * compliance log. Never persisted anywhere in the clear past this point. */
  identifierValueAtRequest: string | null;
}

@Injectable()
@CommandHandler(DeleteAccountCommand)
export class DeleteAccountHandler extends BaseCommandHandler<DeleteAccountCommand, void, Context> {
  private readonly logger = new Logger(DeleteAccountHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
    @Inject(MFA_RECOVERY_CODE_REPOSITORY)
    private readonly recoveryCodes: MfaRecoveryCodeRepositoryPort,
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
      keepHistory: command.input.keepHistory,
      identifierValueAtRequest: user.identifierValue,
    };
  }

  protected async handle(
    _command: DeleteAccountCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    // Scrubs the in-memory aggregate either way (harmless when the row is about to be
    // hard-deleted entirely) — what matters for keepHistory=false is `persist()` below, which
    // never calls `saveWithTx` on this scrubbed copy, only `deleteWithTx`.
    const event = context.user.delete();
    this.logger.log(`account deleted (keepHistory=${context.keepHistory}): ${context.user.id}`);
    const events: UserAccountDeletedEvent[] = event ? [event] : [];
    return { result: undefined, events };
  }

  protected override async persist(context: Context): Promise<void> {
    const identifierHash = context.identifierValueAtRequest
      ? hashIdentifier(context.identifierValueAtRequest, getIdentifierHashSecret(this.config))
      : null;

    await this.prisma.$transaction(async (tx) => {
      if (context.keepHistory) {
        // Anonymize: only the User row is scrubbed — financial rows elsewhere keep pointing at
        // this same userId (Ley 21.719 Art. 11, the "keep my history" opt-in). Security
        // artifacts are hard-deleted regardless — they only ever exist to let someone log back
        // in, and this account never will again.
        await this.repo.saveWithTx(tx, context.user);
        await this.sessions.deleteAllForUserWithTx(tx, context.user.id);
        await this.passkeys.deleteAllForUserWithTx(tx, context.user.id);
        await this.recoveryCodes.deleteAllForUserWithTx(tx, context.user.id);
      } else {
        // Hard delete: removing the User row cascades to every table via its own
        // `onDelete: Cascade` on `userId` — sessions/passkeys/recovery codes included, so no
        // separate calls are needed here.
        await this.repo.deleteWithTx(tx, context.user.id);
      }
      // Compliance evidence either way — see `AccountDeletionLog`'s doc-comment for why this
      // never carries a raw identifier or an FK to `User`.
      await this.deletionLog.createWithTx(tx, context.keepHistory, identifierHash);
    });
  }
}
