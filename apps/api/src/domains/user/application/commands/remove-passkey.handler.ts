import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import {
  SESSION_STEP_UP,
  type SessionStepUpPort,
} from "../../../session/domain/ports/session-step-up.port";
import { PasskeyNotFoundError } from "../../domain/errors";
import { AccountSecurityEvent } from "../../domain/events/account-security.event";
import { assertRecentStepUp } from "../step-up";
import { RemovePasskeyCommand } from "./remove-passkey.command";

/**
 * Removes one of the caller's passkeys.
 *
 * - Needs a recent step-up of the caller's session, checked first: on an account whose only
 *   other factor is that passkey, removing it is what would let a password step-up through
 *   (run-2, the removal counterpart of GHSA-jhp2-jfjr-fqfq).
 * - In the same transaction, closes every OTHER open session opened with it: the session row
 *   loses its `passkeyId` when the passkey goes (`SetNull`), so a session of a cloned credential
 *   would otherwise survive any later compromise review. The caller's own session stays open.
 */
@Injectable()
@CommandHandler(RemovePasskeyCommand)
export class RemovePasskeyHandler extends BaseCommandHandler<RemovePasskeyCommand, void, null> {
  constructor(
    eventBus: EventBus,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    @Inject(SESSION_STEP_UP) private readonly stepUp: SessionStepUpPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RemovePasskeyCommand): Promise<null> {
    await assertRecentStepUp(this.stepUp, command.userId, command.sessionId);
    return null;
  }

  protected async handle(command: RemovePasskeyCommand): Promise<HandleResult<void>> {
    // Read first: the notice names the passkey that went away (specs/032).
    const passkey = await this.passkeys.findByIdOwned(command.userId, command.passkeyId);
    if (!passkey) throw new PasskeyNotFoundError();
    const deleted = await this.prisma.$transaction(async (tx) => {
      // Sessions first, while their `passkeyId` still points at the row.
      await this.sessions.closeByPasskeysWithTx(
        tx,
        [command.passkeyId],
        new Date(),
        command.sessionId,
      );
      const removed = await this.passkeys.deleteOwned(command.userId, command.passkeyId, tx);
      // Nothing removed (a concurrent delete won): roll the closes back with it.
      if (!removed) throw new PasskeyNotFoundError();
      return removed;
    });
    if (!deleted) throw new PasskeyNotFoundError();
    return {
      result: undefined,
      events: [
        new AccountSecurityEvent(command.userId, "PASSKEY_REMOVED", new Date(), passkey.name),
      ],
    };
  }
}
