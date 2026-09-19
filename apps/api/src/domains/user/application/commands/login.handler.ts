import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { compare } from "bcryptjs";

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
    const email = command.input.email.toLowerCase();
    const user = await this.repo.findByEmail(email);
    if (!user?.passwordHash || !(await compare(command.input.password, user.passwordHash))) {
      this.logger.warn(`failed login attempt for ${email}`);
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
