import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { compare } from "bcryptjs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InvalidCredentialsError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { TokenIssuer } from "../token-issuer";
import type { AuthResult } from "./register.handler";
import { LoginCommand } from "./login.command";

@Injectable()
@CommandHandler(LoginCommand)
export class LoginHandler extends BaseCommandHandler<LoginCommand, AuthResult, User> {
  private readonly logger = new Logger(LoginHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    private readonly tokenIssuer: TokenIssuer,
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

  protected async handle(_command: LoginCommand, user: User): Promise<HandleResult<AuthResult>> {
    this.logger.log(`user logged in: ${user.id}`);
    const tokens = this.tokenIssuer.issue({ id: user.id, email: user.email });
    return { result: { tokens, user: user.toContract() }, events: [] };
  }
}
