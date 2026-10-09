import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  SESSION_STATUS,
  type SessionStatusPort,
} from "../../../session/domain/ports/session-status.port";
import { TokenIssuer } from "../token-issuer";
import { GetSessionStatusQuery } from "./get-session-status.query";

/**
 * Answers `GET /auth/session` (spec 031) with `{ signedIn }`, never a 401: a signed-out visitor is
 * the normal case on the public site, and a 401 there is a console error on every page. Signed in
 * means the access token is valid and its session alive — or, when it expired, that the refresh
 * token is valid and ITS session alive (the app will renew it on its first request). Nothing is
 * rotated, written or revealed beyond that one boolean.
 */
@Injectable()
@QueryHandler(GetSessionStatusQuery)
export class GetSessionStatusQueryHandler extends BaseQueryHandler<
  GetSessionStatusQuery,
  auth.SessionStatus,
  null
> {
  constructor(
    private readonly tokens: TokenIssuer,
    @Inject(SESSION_STATUS) private readonly sessions: SessionStatusPort,
  ) {
    super();
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(query: GetSessionStatusQuery): Promise<auth.SessionStatus> {
    const now = new Date();
    for (const claims of [
      this.claims(query.accessToken, (t) => this.tokens.verifyAccess(t)),
      this.claims(query.refreshToken, (t) => this.tokens.verifyRefresh(t)),
    ]) {
      if (claims && (await this.sessions.isAlive(claims.sub, claims.sid, now))) {
        return { signedIn: true };
      }
    }
    return { signedIn: false };
  }

  private claims(
    token: string | undefined,
    verify: (token: string) => { sub: string; sid: string },
  ): { sub: string; sid: string } | null {
    if (!token) return null;
    try {
      return verify(token);
    } catch {
      return null;
    }
  }
}
