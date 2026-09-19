import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InvalidRefreshTokenError, NoRefreshTokenError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { SessionIssuer } from "../session-issuer";
import { TokenIssuer, type TokenPair } from "../token-issuer";
import { RefreshTokenCommand } from "./refresh-token.command";

interface Context {
  user: User;
  sessionId: string;
}

@Injectable()
@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler extends BaseCommandHandler<
  RefreshTokenCommand,
  TokenPair,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    private readonly tokenIssuer: TokenIssuer,
    private readonly sessionIssuer: SessionIssuer,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RefreshTokenCommand): Promise<Context> {
    if (!command.refreshToken) throw new NoRefreshTokenError();
    let sub: string;
    let sid: string;
    try {
      const payload = this.tokenIssuer.verifyRefresh(command.refreshToken);
      sub = payload.sub;
      sid = payload.sid;
    } catch {
      throw new InvalidRefreshTokenError();
    }
    const user = await this.repo.findById(sub);
    if (!user) throw new InvalidRefreshTokenError();
    user.assertActive();
    return { user, sessionId: sid };
  }

  protected async handle(
    _command: RefreshTokenCommand,
    context: Context,
  ): Promise<HandleResult<TokenPair>> {
    // establish() itself throws InvalidRefreshTokenError when the session behind
    // `sessionId` no longer exists (closed by the user elsewhere, or purged).
    const tokens = await this.sessionIssuer.establish(
      { id: context.user.id, email: context.user.email },
      { reuseSessionId: context.sessionId },
    );
    return { result: tokens, events: [] };
  }
}
