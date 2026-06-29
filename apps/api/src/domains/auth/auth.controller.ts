import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

import { auth } from "@finance/contracts";

import {
  ACCESS_COOKIE,
  JwtAuthGuard,
  REFRESH_COOKIE,
} from "../../infra/auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../infra/auth/current-user.decorator";
import { ZodValidationPipe } from "../../infra/http/zod-validation.pipe";
import { AuthService, type TokenPair } from "./auth.service";

function parseDurationMs(s: string): number {
  const match = /^(\d+)([smhd])$/.exec(s);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid token duration format: "${s}". Use a number followed by s/m/h/d.`);
  }
  const n = Number.parseInt(match[1], 10);
  const units: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (units[match[2]] ?? 0);
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post("register")
  async register(
    @Body(new ZodValidationPipe(auth.registerRequestSchema)) body: auth.RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<auth.CurrentUser> {
    const user = await this.service.register(body);
    this.setAuthCookies(res, this.service.issueTokens(user));
    return { id: user.id, email: user.email, name: body.name ?? null };
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(auth.loginRequestSchema)) body: auth.LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<auth.CurrentUser> {
    const user = await this.service.validateCredentials(body);
    this.setAuthCookies(res, this.service.issueTokens(user));
    return this.service.getCurrentUser(user.id);
  }

  @Post("refresh")
  @HttpCode(204)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    this.setAuthCookies(res, await this.service.rotateFromRefresh(token));
  }

  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(ACCESS_COOKIE, this.cookieBase());
    res.clearCookie(REFRESH_COOKIE, this.cookieBase());
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): Promise<auth.CurrentUser> {
    return this.service.getCurrentUser(user.id);
  }

  private cookieBase() {
    const isProd = this.config.get<string>("NODE_ENV") === "production";
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: isProd,
      path: "/",
    };
  }

  private setAuthCookies(res: Response, tokens: TokenPair): void {
    const accessMs = parseDurationMs(
      this.config.get<string>("JWT_ACCESS_EXPIRES") ?? "15m",
    );
    const refreshMs = parseDurationMs(
      this.config.get<string>("JWT_REFRESH_EXPIRES") ?? "7d",
    );
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...this.cookieBase(),
      maxAge: accessMs,
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieBase(),
      maxAge: refreshMs,
    });
  }
}
