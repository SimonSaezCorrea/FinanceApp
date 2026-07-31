import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { hash } from "bcryptjs";

import type { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { EmailTakenError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { TokenIssuer, type TokenPair } from "../token-issuer";
import { RegisterCommand } from "./register.command";

export interface AuthResult {
  tokens: TokenPair;
  user: auth.CurrentUser;
}

interface Context {
  passwordHash: string;
}

@Injectable()
@CommandHandler(RegisterCommand)
export class RegisterHandler extends BaseCommandHandler<RegisterCommand, AuthResult, Context> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    private readonly tokenIssuer: TokenIssuer,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RegisterCommand): Promise<Context> {
    const email = command.input.email.toLowerCase();
    const existing = await this.repo.findByEmail(email);
    if (existing) throw new EmailTakenError();
    return { passwordHash: await hash(command.input.password, 12) };
  }

  protected async handle(
    command: RegisterCommand,
    context: Context,
  ): Promise<HandleResult<AuthResult>> {
    const plan = User.planRegistration({ ...command.input, passwordHash: context.passwordHash });
    const user = await this.repo.create(plan);
    const tokens = this.tokenIssuer.issue({ id: user.id, email: user.email });
    return { result: { tokens, user: user.toContract() }, events: [] };
  }
}
