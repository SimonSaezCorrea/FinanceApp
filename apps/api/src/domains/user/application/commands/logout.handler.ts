import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import { TokenIssuer } from "../token-issuer";
import { LogoutCommand } from "./logout.command";

/**
 * Best-effort session close on logout (specs/023) — stamps `closedAt` on the session
 * tied to the outgoing refresh token BEFORE the controller clears cookies, so a device
 * that explicitly logged out doesn't linger as "active" in the user's session list
 * until its natural expiry. Tolerant of everything: a missing, expired, or otherwise
 * unparseable refresh token resolves to a no-op — logout must always succeed
 * client-side (cookies get cleared either way), never fail just because there was
 * nothing server-side left to close. No ownership check needed: the `sid` comes from a
 * cryptographically verified refresh token, which already proves it (`closeById`).
 */
@Injectable()
@CommandHandler(LogoutCommand)
export class LogoutHandler extends BaseCommandHandler<LogoutCommand, void, string | null> {
  constructor(
    eventBus: EventBus,
    private readonly tokenIssuer: TokenIssuer,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: LogoutCommand): Promise<string | null> {
    if (!command.refreshToken) return null;
    try {
      return this.tokenIssuer.verifyRefresh(command.refreshToken).sid;
    } catch {
      return null;
    }
  }

  protected async handle(_command: LogoutCommand, sid: string | null): Promise<HandleResult<void>> {
    if (sid) await this.sessions.closeById(sid);
    return { result: undefined, events: [] };
  }
}
