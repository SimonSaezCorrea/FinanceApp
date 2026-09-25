import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

import { auth } from "@finance/contracts";

import { ACCESS_COOKIE, JwtAuthGuard, REFRESH_COOKIE } from "../../../infra/auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { ChangePasswordCommand } from "../application/commands/change-password.command";
import { CloseSessionCommand } from "../application/commands/close-session.command";
import { ConfirmMfaEnrollmentCommand } from "../application/commands/confirm-mfa-enrollment.command";
import { ConfirmPasskeyRegistrationCommand } from "../application/commands/confirm-passkey-registration.command";
import { DeleteAccountCommand } from "../application/commands/delete-account.command";
import { DisableMfaCommand } from "../application/commands/disable-mfa.command";
import type { LoginResult } from "../application/commands/login.handler";
import { LoginCommand } from "../application/commands/login.command";
import { LogoutCommand } from "../application/commands/logout.command";
import type { AuthResult } from "../application/commands/register.handler";
import { RefreshTokenCommand } from "../application/commands/refresh-token.command";
import { RegisterCommand } from "../application/commands/register.command";
import { RemovePasskeyCommand } from "../application/commands/remove-passkey.command";
import { RenamePasskeyCommand } from "../application/commands/rename-passkey.command";
import { RevokeOtherSessionsCommand } from "../application/commands/revoke-other-sessions.command";
import { StartMfaEnrollmentCommand } from "../application/commands/start-mfa-enrollment.command";
import type { StartPasskeyLoginResult } from "../application/commands/start-passkey-login.handler";
import { StartPasskeyLoginCommand } from "../application/commands/start-passkey-login.command";
import { StartPasskeyRegistrationCommand } from "../application/commands/start-passkey-registration.command";
import { StartStepUpPasskeyCommand } from "../application/commands/start-step-up-passkey.command";
import { UpdatePreferencesCommand } from "../application/commands/update-preferences.command";
import { UpdateProfileCommand } from "../application/commands/update-profile.command";
import { VerifyMfaLoginCommand } from "../application/commands/verify-mfa-login.command";
import { VerifyPasskeyLoginCommand } from "../application/commands/verify-passkey-login.command";
import { VerifyStepUpPasskeyCommand } from "../application/commands/verify-step-up-passkey.command";
import { VerifyStepUpCommand } from "../application/commands/verify-step-up.command";
import { PasskeyChallengeInvalidError } from "../domain/errors";
import { PasskeyChallengeToken } from "../application/passkey-challenge-token";
import { TokenIssuer, type TokenPair } from "../application/token-issuer";
import { GetMeQuery } from "../application/queries/get-me.query";
import { ListConsentsQuery } from "../application/queries/list-consents.query";
import { ListPasskeysQuery } from "../application/queries/list-passkeys.query";
import { ListSessionsQuery } from "../application/queries/list-sessions.query";
import { passkeyIdParamsSchema } from "./dto/passkey-id.params";
import { sessionIdParamsSchema } from "./dto/session-id.params";

const MFA_PENDING_COOKIE = "mfa_pending_token";
const MFA_PENDING_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;
const PASSKEY_CHALLENGE_COOKIE = "passkey_challenge_token";
const PASSKEY_CHALLENGE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;
/** Its own cookie, apart from the login ceremony's, so the two can never clobber each other. */
const STEP_UP_CHALLENGE_COOKIE = "step_up_challenge_token";

function parseDurationMs(s: string): number {
  const match = /^(\d+)([smhd])$/.exec(s);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid token duration format: "${s}". Use a number followed by s/m/h/d.`);
  }
  const n = Number.parseInt(match[1], 10);
  const units: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (units[match[2]] ?? 0);
}

/**
 * Facade (FR-012): translates each HTTP request into a command/query and
 * dispatches it via `CommandBus`/`QueryBus` — never constructs an aggregate,
 * never calls a repository, never contains a business-rule `if`. Cookie
 * setting stays a presentation-layer concern (an HTTP response detail), same
 * as `accounts`' Facade owning its own response shaping.
 */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly config: ConfigService,
    private readonly tokenIssuer: TokenIssuer,
    private readonly passkeyChallenge: PasskeyChallengeToken,
  ) {}

  @Post("register")
  async register(
    @Req() req: Request,
    @Body(new ZodValidationPipe(auth.registerRequestSchema)) body: auth.RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<auth.CurrentUser> {
    const { tokens, user } = await this.commandBus.execute<RegisterCommand, AuthResult>(
      new RegisterCommand(body, this.deviceFrom(req)),
    );
    this.setAuthCookies(res, tokens);
    return user;
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Req() req: Request,
    @Body(new ZodValidationPipe(auth.loginRequestSchema)) body: auth.LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<auth.LoginResponse> {
    const result = await this.commandBus.execute<LoginCommand, LoginResult>(
      new LoginCommand(body, this.deviceFrom(req)),
    );
    if (result.mfaRequired) {
      res.cookie(MFA_PENDING_COOKIE, result.mfaPendingToken, {
        ...this.cookieBase(),
        maxAge: MFA_PENDING_COOKIE_MAX_AGE_MS,
      });
      return { mfaRequired: true };
    }
    this.setAuthCookies(res, result.tokens);
    return { mfaRequired: false, user: result.user };
  }

  @Post("login/mfa-verify")
  @HttpCode(200)
  async verifyMfaLogin(
    @Req() req: Request,
    @Body(new ZodValidationPipe(auth.verifyMfaLoginRequestSchema)) body: auth.VerifyMfaLoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: auth.CurrentUser }> {
    const pendingToken = (req.cookies as Record<string, string> | undefined)?.[MFA_PENDING_COOKIE];
    const { sub: userId } = this.tokenIssuer.verifyMfaPending(pendingToken ?? "");
    const { tokens, user } = await this.commandBus.execute<VerifyMfaLoginCommand, AuthResult>(
      new VerifyMfaLoginCommand(userId, body, this.deviceFrom(req)),
    );
    res.clearCookie(MFA_PENDING_COOKIE, this.cookieBase());
    this.setAuthCookies(res, tokens);
    return { user };
  }

  @Post("login/passkey-options")
  @HttpCode(200)
  async startPasskeyLogin(
    @Body(new ZodValidationPipe(auth.startPasskeyLoginRequestSchema))
    body: auth.StartPasskeyLoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<auth.StartPasskeyLoginResponse> {
    const { options, userId, discoverable } = await this.commandBus.execute<
      StartPasskeyLoginCommand,
      StartPasskeyLoginResult
    >(new StartPasskeyLoginCommand(body.identifierValue));
    const challenge = (options as { challenge: string }).challenge;
    res.cookie(
      PASSKEY_CHALLENGE_COOKIE,
      this.passkeyChallenge.issue({ challenge, userId, discoverable }),
      { ...this.cookieBase(), maxAge: PASSKEY_CHALLENGE_COOKIE_MAX_AGE_MS },
    );
    return { options };
  }

  @Post("login/passkey-verify")
  @HttpCode(200)
  async verifyPasskeyLogin(
    @Req() req: Request,
    @Body(new ZodValidationPipe(auth.verifyPasskeyLoginRequestSchema))
    body: auth.VerifyPasskeyLoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: auth.CurrentUser }> {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      PASSKEY_CHALLENGE_COOKIE
    ];
    const { challenge, userId, discoverable } = this.passkeyChallenge.verify(cookieToken ?? "");
    const { tokens, user } = await this.commandBus.execute<VerifyPasskeyLoginCommand, AuthResult>(
      new VerifyPasskeyLoginCommand(
        body.response,
        challenge,
        userId,
        discoverable,
        this.deviceFrom(req),
      ),
    );
    res.clearCookie(PASSKEY_CHALLENGE_COOKIE, this.cookieBase());
    this.setAuthCookies(res, tokens);
    return { user };
  }

  @Post("refresh")
  @HttpCode(204)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const tokens = await this.commandBus.execute<RefreshTokenCommand, TokenPair>(
      new RefreshTokenCommand(token),
    );
    this.setAuthCookies(res, tokens);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.commandBus.execute<LogoutCommand, void>(new LogoutCommand(token));
    res.clearCookie(ACCESS_COOKIE, this.cookieBase());
    res.clearCookie(REFRESH_COOKIE, this.cookieBase());
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): Promise<auth.CurrentUser> {
    return this.queryBus.execute(new GetMeQuery(user.id));
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(auth.updateProfileRequestSchema)) body: auth.UpdateProfileRequest,
  ): Promise<auth.CurrentUser> {
    return this.commandBus.execute(new UpdateProfileCommand(user.id, body));
  }

  @Post("me/password")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(auth.changePasswordRequestSchema)) body: auth.ChangePasswordRequest,
  ): Promise<void> {
    return this.commandBus.execute(new ChangePasswordCommand(user.id, body, user.sessionId));
  }

  @Patch("me/preferences")
  @UseGuards(JwtAuthGuard)
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(auth.updatePreferencesRequestSchema))
    body: auth.UpdatePreferencesRequest,
  ): Promise<auth.CurrentUser> {
    return this.commandBus.execute(new UpdatePreferencesCommand(user.id, body));
  }

  @Post("me/mfa/enroll")
  @UseGuards(JwtAuthGuard)
  startMfaEnrollment(@CurrentUser() user: AuthUser): Promise<auth.StartMfaEnrollmentResponse> {
    return this.commandBus.execute(new StartMfaEnrollmentCommand(user.id));
  }

  @Post("me/mfa/confirm")
  @UseGuards(JwtAuthGuard)
  confirmMfaEnrollment(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(auth.confirmMfaEnrollmentRequestSchema))
    body: auth.ConfirmMfaEnrollmentRequest,
  ): Promise<auth.ConfirmMfaEnrollmentResponse> {
    return this.commandBus.execute(new ConfirmMfaEnrollmentCommand(user.id, body));
  }

  @Post("me/mfa/disable")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  disableMfa(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(auth.disableMfaRequestSchema)) body: auth.DisableMfaRequest,
  ): Promise<void> {
    return this.commandBus.execute(new DisableMfaCommand(user.id, body, user.sessionId));
  }

  @Post("me/passkeys/register-options")
  @UseGuards(JwtAuthGuard)
  async startPasskeyRegistration(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<auth.StartPasskeyRegistrationResponse> {
    const { options } = await this.commandBus.execute<
      StartPasskeyRegistrationCommand,
      auth.StartPasskeyRegistrationResponse
    >(new StartPasskeyRegistrationCommand(user.id));
    const challenge = (options as { challenge: string }).challenge;
    res.cookie(
      PASSKEY_CHALLENGE_COOKIE,
      this.passkeyChallenge.issue({ challenge, userId: user.id, discoverable: false }),
      { ...this.cookieBase(), maxAge: PASSKEY_CHALLENGE_COOKIE_MAX_AGE_MS },
    );
    return { options };
  }

  @Post("me/passkeys/register-verify")
  @UseGuards(JwtAuthGuard)
  async confirmPasskeyRegistration(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body(new ZodValidationPipe(auth.confirmPasskeyRegistrationRequestSchema))
    body: auth.ConfirmPasskeyRegistrationRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<auth.Passkey> {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      PASSKEY_CHALLENGE_COOKIE
    ];
    const { challenge, userId } = this.passkeyChallenge.verify(cookieToken ?? "");
    if (userId !== user.id) {
      res.clearCookie(PASSKEY_CHALLENGE_COOKIE, this.cookieBase());
      throw new PasskeyChallengeInvalidError();
    }
    const created = await this.commandBus.execute<ConfirmPasskeyRegistrationCommand, auth.Passkey>(
      new ConfirmPasskeyRegistrationCommand(user.id, body.name, body.response, challenge),
    );
    res.clearCookie(PASSKEY_CHALLENGE_COOKIE, this.cookieBase());
    return created;
  }

  @Get("me/consents")
  @UseGuards(JwtAuthGuard)
  listConsents(@CurrentUser() user: AuthUser): Promise<auth.ListConsentsResponse> {
    return this.queryBus.execute(new ListConsentsQuery(user.id));
  }

  @Get("me/passkeys")
  @UseGuards(JwtAuthGuard)
  listPasskeys(@CurrentUser() user: AuthUser): Promise<auth.ListPasskeysResponse> {
    return this.queryBus.execute(new ListPasskeysQuery(user.id));
  }

  @Delete("me/passkeys/:id")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  removePasskey(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(passkeyIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemovePasskeyCommand(user.id, params.id));
  }

  @Patch("me/passkeys/:id")
  @UseGuards(JwtAuthGuard)
  renamePasskey(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(passkeyIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(auth.renamePasskeyRequestSchema)) body: auth.RenamePasskeyRequest,
  ): Promise<auth.Passkey> {
    return this.commandBus.execute(new RenamePasskeyCommand(user.id, params.id, body.name));
  }

  @Get("sessions")
  @UseGuards(JwtAuthGuard)
  listSessions(@CurrentUser() user: AuthUser): Promise<auth.ListSessionsResponse> {
    return this.queryBus.execute(new ListSessionsQuery(user.id, user.sessionId));
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  closeSession(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(sessionIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    return this.commandBus.execute(new CloseSessionCommand(user.id, params.id, user.sessionId));
  }

  @Post("sessions/revoke-others")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  revokeOtherSessions(@CurrentUser() user: AuthUser): Promise<void> {
    return this.commandBus.execute(new RevokeOtherSessionsCommand(user.id, user.sessionId));
  }

  /** Step-up before closing sessions (2026-09-25): TOTP code or password (password only when the
   * user has neither TOTP nor a passkey). Stamps the caller's own session. */
  @Post("sessions/step-up")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  verifyStepUp(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(auth.stepUpRequestSchema)) body: auth.StepUpRequest,
  ): Promise<auth.StepUpResponse> {
    return this.commandBus.execute(new VerifyStepUpCommand(user.id, user.sessionId, body));
  }

  @Post("sessions/step-up/passkey-options")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async startStepUpPasskey(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<auth.StartPasskeyLoginResponse> {
    const options = await this.commandBus.execute<StartStepUpPasskeyCommand, { challenge: string }>(
      new StartStepUpPasskeyCommand(user.id),
    );
    res.cookie(
      STEP_UP_CHALLENGE_COOKIE,
      this.passkeyChallenge.issue({
        challenge: options.challenge,
        userId: user.id,
        discoverable: false,
      }),
      { ...this.cookieBase(), maxAge: PASSKEY_CHALLENGE_COOKIE_MAX_AGE_MS },
    );
    return { options };
  }

  @Post("sessions/step-up/passkey-verify")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async verifyStepUpPasskey(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body(new ZodValidationPipe(auth.verifyPasskeyLoginRequestSchema))
    body: auth.VerifyPasskeyLoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<auth.StepUpResponse> {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      STEP_UP_CHALLENGE_COOKIE
    ];
    const { challenge, userId } = this.passkeyChallenge.verify(cookieToken ?? "");
    res.clearCookie(STEP_UP_CHALLENGE_COOKIE, this.cookieBase());
    return this.commandBus.execute(
      new VerifyStepUpPasskeyCommand(user.id, user.sessionId, body.response, challenge, userId),
    );
  }

  @Post("me/delete-account")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(auth.deleteAccountRequestSchema)) body: auth.DeleteAccountRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteAccountCommand(user.id, body));
    res.clearCookie(ACCESS_COOKIE, this.cookieBase());
    res.clearCookie(REFRESH_COOKIE, this.cookieBase());
  }

  /** Extracts what a session's `deviceLabel`/`country` are later derived from — the only
   * point this Facade reads `req.headers`/`req.ip` for anything beyond cookies. */
  private deviceFrom(req: Request): { userAgent?: string; ip?: string } {
    return { userAgent: req.headers["user-agent"], ip: req.ip };
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
    const accessMs = parseDurationMs(this.config.get<string>("JWT_ACCESS_EXPIRES") ?? "15m");
    const refreshMs = parseDurationMs(this.config.get<string>("JWT_REFRESH_EXPIRES") ?? "7d");
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
