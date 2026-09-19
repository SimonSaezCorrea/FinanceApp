import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "./current-user.decorator";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

interface AccessPayload {
  sub: string;
  email: string | null;
  /** Which `Session` row this token belongs to (specs/023) — checked below so closing a
   * session revokes its still-technically-unexpired access token immediately, not just
   * on the next refresh (research.md R2). */
  sid: string;
}

/** Protects routes: validates the access-token httpOnly cookie (Principle II), that the
 * account hasn't been deactivated since the token was issued (FR-010), and that the
 * session it belongs to hasn't been closed since (specs/023). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    if (!token) throw new UnauthorizedException();

    let payload: AccessPayload;
    try {
      payload = this.jwt.verify<AccessPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
    } catch {
      throw new UnauthorizedException();
    }

    // One query, not two: the session's own aliveness is what's actually being checked
    // (closed, purged, or past its own `expiresAt` all mean an instantly-revoked
    // device), and its owner's status rides along on the same row via the relation —
    // same cost as the old user-only query, not an added round-trip.
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { closedAt: true, expiresAt: true, user: { select: { status: true } } },
    });
    if (!session || session.closedAt !== null || session.expiresAt <= new Date()) {
      throw new UnauthorizedException();
    }
    if (session.user.status === "DISABLED") {
      throw new UnauthorizedException({ code: "ACCOUNT_DISABLED" });
    }

    req.user = { id: payload.sub, email: payload.email, sessionId: payload.sid };
    return true;
  }
}
