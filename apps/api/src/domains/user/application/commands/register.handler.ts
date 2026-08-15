import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { hash } from "bcryptjs";

import type { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
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
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
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
    // The user has no currency preference yet at registration time; CLP is the
    // app default (the same one `User.preferredCurrency` starts with).
    await this.createCashAccount(user.id, "CLP");
    const tokens = this.tokenIssuer.issue({ id: user.id, email: user.email });
    return { result: { tokens, user: user.toContract() }, events: [] };
  }

  /**
   * Cash is the account everyone already has — the notes in a wallet exist whether
   * or not an app models them. Creating it here means a new user can record a cash
   * expense on day one without first inventing an account for it, and removal is
   * refused while it is the only one (`CASH_ACCOUNT_REQUIRED`).
   */
  private async createCashAccount(userId: string, currency: string): Promise<void> {
    await this.accounts.createWithCards(userId, {
      name: "Efectivo",
      type: "CASH",
      status: "ACTIVE",
      currency,
      institution: null,
      institutionId: null,
      accountNumber: null,
      accountAlias: null,
      initialBalance: "0",
      overdraftLimit: "0",
      balanceCeiling: null,
      creditLimit: "0",
      creditUsedInitial: "0",
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [],
    });
  }
}
