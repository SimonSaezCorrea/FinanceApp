import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import { isCatalogCurrent } from "../../../authenticator-model/domain/authenticator-model";
import {
  AUTHENTICATOR_MODEL_REPOSITORY,
  type AuthenticatorModelRepositoryPort,
} from "../../../authenticator-model/domain/ports/authenticator-model.repository.port";
import type { MarkedPasskey } from "../../../passkey/domain/passkey.entity";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import { AccountSecurityEvent } from "../../domain/events/account-security.event";
import { ReviewCompromisedPasskeysCommand } from "./review-compromised-passkeys.command";

export interface ReviewOutcome {
  marked: number;
  sessionsClosed: number;
  /** Why nothing was reviewed: no stored catalog, or an expired one (FR-007). */
  skipped?: "no-catalog" | "expired-catalog";
}

@Injectable()
@CommandHandler(ReviewCompromisedPasskeysCommand)
export class ReviewCompromisedPasskeysHandler extends BaseCommandHandler<
  ReviewCompromisedPasskeysCommand,
  ReviewOutcome,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(AUTHENTICATOR_MODEL_REPOSITORY)
    private readonly models: AuthenticatorModelRepositoryPort,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(
    command: ReviewCompromisedPasskeysCommand,
  ): Promise<HandleResult<ReviewOutcome>> {
    const version = await this.models.currentCatalog();
    if (!version) {
      return { result: { marked: 0, sessionsClosed: 0, skipped: "no-catalog" }, events: [] };
    }
    // An expired copy still identifies models, but never marks passkeys (FR-007).
    if (!isCatalogCurrent(version, command.now)) {
      return { result: { marked: 0, sessionsClosed: 0, skipped: "expired-catalog" }, events: [] };
    }
    const reasons = await this.models.compromised();
    if (reasons.size === 0) return { result: { marked: 0, sessionsClosed: 0 }, events: [] };

    // One transaction: a passkey is never marked while its sessions stay open, or vice versa.
    const { marked, sessionsClosed } = await this.prisma.$transaction(async (tx) => {
      const rows: MarkedPasskey[] = await this.passkeys.markCompromisedWithTx(
        tx,
        reasons,
        command.now,
      );
      const closed = await this.sessions.closeByPasskeysWithTx(
        tx,
        rows.map((r) => r.id),
        command.now,
      );
      return { marked: rows, sessionsClosed: closed };
    });

    return {
      result: { marked: marked.length, sessionsClosed },
      // Published after the commit, once per passkey this run marked: a rerun marks nothing.
      events: marked.map(
        (p) => new AccountSecurityEvent(p.userId, "PASSKEY_COMPROMISED", command.now, p.name),
      ),
    };
  }
}
