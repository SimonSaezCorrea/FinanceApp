import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InvalidRefreshTokenError, NoRefreshTokenError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { TokenIssuer, type TokenPair } from "../token-issuer";
import { RefreshTokenCommand } from "./refresh-token.command";

@Injectable()
@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler extends BaseCommandHandler<RefreshTokenCommand, TokenPair, User> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    private readonly tokenIssuer: TokenIssuer,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RefreshTokenCommand): Promise<User> {
    if (!command.refreshToken) throw new NoRefreshTokenError();
    let sub: string;
    try {
      sub = this.tokenIssuer.verifyRefresh(command.refreshToken).sub;
    } catch {
      throw new InvalidRefreshTokenError();
    }
    const user = await this.repo.findById(sub);
    if (!user) throw new InvalidRefreshTokenError();
    user.assertActive();
    return user;
  }

  protected async handle(_command: RefreshTokenCommand, user: User): Promise<HandleResult<TokenPair>> {
    const tokens = this.tokenIssuer.issue({ id: user.id, email: user.email });
    return { result: tokens, events: [] };
  }
}
