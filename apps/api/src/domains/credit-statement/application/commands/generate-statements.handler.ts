import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { resolveBillingEligibility } from "../../domain/billing-eligibility.strategy";
import { nextBoundaryAfter } from "../../../billing-settings/domain/billing-cycle";
import type { BankAccount } from "../../../bank-account/domain/bank-account.aggregate";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import type { StatementClosedEvent } from "../../domain/events/statement-closed.event";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import {
  GenerateAllDueStatementsCommand,
  GenerateStatementsCommand,
} from "./generate-statements.command";

/** Closes an account's currently OPEN `CreditStatement` once its
 * `billingCycleDay` boundary has passed AND it's eligible (Strategy) —
 * shared by both commands below. Never creates a statement itself (that
 * happens lazily elsewhere, the moment a contributing movement occurs). */
async function closeIfDue(
  account: BankAccount,
  statementRepo: CreditStatementRepositoryPort,
): Promise<StatementClosedEvent | null> {
  const day = account.billingCycleDay;
  if (!day) return null;

  const open = await statementRepo.findOpenForAccount(account.id);
  if (!open) return null; // no usage since the last close -> nothing to generate

  const boundary = nextBoundaryAfter(open.periodStart, day);
  if (new Date() < boundary) return null;

  const eligible = resolveBillingEligibility({
    accountType: account.type,
    accountStatus: account.status,
    cards: account.cards.map((c) => ({
      kind: c.kind,
      isPrimary: c.isPrimary,
      isActive: c.isActive,
    })),
  });
  if (!eligible) return null; // leave it accumulating, don't seal it this cycle

  const event = open.close(boundary);
  await statementRepo.save(open); // single-aggregate save (no cross-aggregate transaction needed here)
  return event;
}

@Injectable()
@CommandHandler(GenerateStatementsCommand)
export class GenerateStatementsHandler extends BaseCommandHandler<
  GenerateStatementsCommand,
  boolean,
  BankAccount
> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statementRepo: CreditStatementRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: GenerateStatementsCommand): Promise<BankAccount> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    return account;
  }

  protected async handle(
    _command: GenerateStatementsCommand,
    account: BankAccount,
  ): Promise<HandleResult<boolean>> {
    const event = await closeIfDue(account, this.statementRepo);
    return { result: event !== null, events: event ? [event] : [] };
  }
}

/** Cron trigger — every account (any user) with a billing day configured.
 * `scope: "system"`, no `userId` (Constitution Principle II's named,
 * typed exception). */
@Injectable()
@CommandHandler(GenerateAllDueStatementsCommand)
export class GenerateAllDueStatementsHandler extends BaseCommandHandler<
  GenerateAllDueStatementsCommand,
  number,
  BankAccount[]
> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statementRepo: CreditStatementRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<BankAccount[]> {
    return this.accountRepo.listDueForBilling();
  }

  protected async handle(
    _command: GenerateAllDueStatementsCommand,
    accounts: BankAccount[],
  ): Promise<HandleResult<number>> {
    const events = [];
    for (const account of accounts) {
      const event = await closeIfDue(account, this.statementRepo);
      if (event) events.push(event);
    }
    return { result: events.length, events };
  }
}
