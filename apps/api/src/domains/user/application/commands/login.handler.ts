import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { compare } from "bcryptjs";

import { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InvalidCredentialsError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { SessionIssuer } from "../session-issuer";
import { TokenIssuer } from "../token-issuer";
import type { AuthResult } from "./register.handler";
import { LoginCommand } from "./login.command";

/**
 * A user without MFA gets a real session, exactly as before. A user WITH MFA active gets
 * neither `tokens` nor `user` — only a short-lived pending token, which the controller carries
 * in its own httpOnly cookie (never the session cookies) until `VerifyMfaLoginCommand`
 * completes the second factor (specs/021).
 */
export type LoginResult =
  ({ mfaRequired: false } & AuthResult) | { mfaRequired: true; mfaPendingToken: string };

@Injectable()
@CommandHandler(LoginCommand)
export class LoginHandler extends BaseCommandHandler<LoginCommand, LoginResult, User> {
  private readonly logger = new Logger(LoginHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    private readonly tokenIssuer: TokenIssuer,
    private readonly sessionIssuer: SessionIssuer,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: LoginCommand): Promise<User> {
    // Login is by RUT, not email (Chilean convention) — normalized the same way it was at
    // registration, so "12.345.678-5" and "123456785" resolve to the same account.
    const identifierValue = auth.normalizeRut(command.input.identifierValue);
    const user = await this.repo.findByIdentifierValue(identifierValue);
    if (!user?.passwordHash || !(await compare(command.input.password, user.passwordHash))) {
      this.logger.warn(`failed login attempt for ${identifierValue}`);
      throw new InvalidCredentialsError();
    }
    // ACCOUNT_DISABLED — rejected even with otherwise-valid credentials (FR-... ported unchanged).
    user.assertActive();
    return user;
  }

  protected async handle(command: LoginCommand, user: User): Promise<HandleResult<LoginResult>> {
    if (user.mfaEnabled) {
      this.logger.log(`password verified, awaiting MFA: ${user.id}`);
      const mfaPendingToken = this.tokenIssuer.issueMfaPending(user.id);
      return { result: { mfaRequired: true, mfaPendingToken }, events: [] };
    }
    this.logger.log(`user logged in: ${user.id}`);
    const tokens = await this.sessionIssuer.establish(
      { id: user.id, email: user.email },
      { userAgent: command.device?.userAgent, ip: command.device?.ip },
    );
    return { result: { mfaRequired: false, tokens, user: user.toContract() }, events: [] };
  }
}
