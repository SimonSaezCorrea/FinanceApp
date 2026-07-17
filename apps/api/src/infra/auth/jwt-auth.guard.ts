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
}

/** Protects routes: validates the access-token httpOnly cookie (Principle II) and that the
 * account hasn't been deactivated since the token was issued (FR-010). */
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

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true },
    });
    if (!user || user.status === "DISABLED") {
      throw new UnauthorizedException({ code: "ACCOUNT_DISABLED" });
    }

    req.user = { id: payload.sub, email: payload.email };
    return true;
  }
}
