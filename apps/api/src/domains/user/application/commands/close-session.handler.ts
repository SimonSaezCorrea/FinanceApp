import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import { SessionNotFoundError } from "../../domain/errors";
import { CloseSessionCommand } from "./close-session.command";

/**
 * Stamps `closedAt` (never deletes — amendment 2026-09-19, session.entity.ts). The
 * row's `closedAt IS NULL` is what `JwtAuthGuard`/refresh check, so closing revokes
 * that device's access immediately, not just on its next refresh. Works identically
 * whether `:id` names a DIFFERENT session or the caller's own current one (spec.md
 * edge case) — no exception either way. Idempotent: closing an already-closed session
 * is a harmless no-op (204), never re-stamps `closedAt` — only a truly foreign or
 * nonexistent id is an error (404).
 */
@Injectable()
@CommandHandler(CloseSessionCommand)
export class CloseSessionHandler extends BaseCommandHandler<CloseSessionCommand, void, null> {
  constructor(
    eventBus: EventBus,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: CloseSessionCommand): Promise<HandleResult<void>> {
    const exists = await this.sessions.existsForUser(command.userId, command.sessionId);
    if (!exists) throw new SessionNotFoundError();
    await this.sessions.closeOwned(command.userId, command.sessionId);
    return { result: undefined, events: [] };
  }
}
