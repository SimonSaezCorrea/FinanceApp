import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import type { BankAccount } from "../../../bank-account/domain/bank-account.aggregate";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import type { CreditStatement } from "../../domain/credit-statement.aggregate";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../../installment-plan/domain/ports/installment-plan.repository.port";
import { nextBoundaryAfter } from "../../../billing-settings/domain/billing-cycle";
import { resolveBillingEligibility } from "../../domain/billing-eligibility.strategy";
import type { StatementClosedEvent } from "../../domain/events/statement-closed.event";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import {
  GenerateAllDueStatementsCommand,
  GenerateStatementsCommand,
} from "./generate-statements.command";

/**
 * Closes an account's currently OPEN `CreditStatement` once its `billingCycleDay`
 * boundary has passed AND it's eligible (Strategy) — shared by both commands below.
 * Never creates a statement itself (that happens lazily elsewhere, the moment a
 * contributing movement occurs).
 *
 * Spec 014: closing also STAMPS the instalments this period charges
 * (`installment-plan`'s `listBillableForCards`/`stampBillableWithTx` — composed
 * through the plan's own port, never a direct read of the `installment-payment`
 * table here, per Constitution VI). Both writes commit in ONE `prisma.$transaction`:
 * a period closed with its instalments unstamped would double- or never-bill them
 * on the very next close, and a domain event dispatches OUTSIDE this transaction
 * (synchronously, but after commit), so it cannot be what guarantees atomicity here.
 */
/** Far enough that "any instalment ever scheduled" is what this fetches, with no
 * date filtering — used only to check for existence/find the earliest one when no
 * period has opened yet. Never persisted. */
const FAR_FUTURE = new Date(Date.UTC(9999, 11, 31));
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A plan's purchase movement deliberately never links to a statement (FR-007), so
 * an account whose ONLY activity is a credit-card instalment plan never gets an
 * OPEN period through the ordinary path — that only happens when some OTHER
 * movement is recorded (`findOrCreateOpenStatement`, in `transaction`). Without
 * this, such a plan could never be billed at all: `closeIfDue` would find nothing
 * open, forever.
 *
 * Seeds one from the schedule itself: `periodStart` is set the day BEFORE the
 * earliest still-unbilled instalment's due date, so `nextBoundaryAfter` lands its
 * boundary exactly on that due date rather than skipping a whole cycle ahead (it
 * returns the first occurrence STRICTLY AFTER `periodStart`).
 */
async function seedPeriodFromSchedule(
  account: BankAccount,
  statementRepo: CreditStatementRepositoryPort,
  planRepo: InstallmentPlanRepositoryPort,
): Promise<CreditStatement | null> {
  const creditCardIds = account.cards.filter((c) => c.kind === "CREDIT").map((c) => c.id);
  if (creditCardIds.length === 0) return null;
  const candidates = await planRepo.listBillableForCards(creditCardIds, FAR_FUTURE);
  if (candidates.length === 0) return null;
  const earliestDue = candidates.reduce(
    (min, c) => (c.dueDate.getTime() < min.getTime() ? c.dueDate : min),
    candidates[0].dueDate,
  );
  // Instalment plans are only ever in the account's own currency (spec 028 R14).
  const currency = account.snapshot().currency;
  await statementRepo.findOrCreateOpenForAccount(
    account.id,
    new Date(earliestDue.getTime() - ONE_DAY_MS),
    currency,
  );
  return statementRepo.findOpenForAccount(account.id, currency);
}

/**
 * Spec 028: an account keeps one OPEN period per currency, and the cycle belongs to
 * the ACCOUNT — every open period closes on the SAME boundary, computed from the
 * account-currency period's start (they all share it, research R2; a foreign-only
 * cycle computes it from its own). Only the account-currency period is ever seeded
 * from the instalment schedule, and only it stamps instalments: plans are always in
 * the account's own currency. A currency with no usage has no open period, so it
 * simply isn't closed — no empty statement is ever created.
 */
async function closeIfDue(
  account: BankAccount,
  statementRepo: CreditStatementRepositoryPort,
  planRepo: InstallmentPlanRepositoryPort,
  prisma: PrismaService,
): Promise<StatementClosedEvent[]> {
  const day = account.billingCycleDay;
  if (!day) return [];

  const accountCurrency = account.snapshot().currency;
  const opens = await statementRepo.listOpenForAccount(account.id);
  let primary = opens.find((s) => s.currency === accountCurrency) ?? null;
  if (!primary) {
    primary = await seedPeriodFromSchedule(account, statementRepo, planRepo);
    if (primary) opens.push(primary);
  }
  if (opens.length === 0) return []; // no usage since the last close, nothing scheduled

  const anchor = (primary ?? opens[0]).periodStart;
  const boundary = nextBoundaryAfter(anchor, day, account.billingCycleType);
  if (new Date() < boundary) return [];

  const eligible = resolveBillingEligibility({
    accountType: account.type,
    accountStatus: account.status,
    cards: account.cards.map((c) => ({
      kind: c.kind,
      isPrimary: c.isPrimary,
      isActive: c.isActive,
    })),
  });
  if (!eligible) return []; // leave them accumulating, don't seal them this cycle

  const events = opens.map((s) => s.close(boundary));
  const creditCardIds = account.cards.filter((c) => c.kind === "CREDIT").map((c) => c.id);
  const billable =
    primary && creditCardIds.length > 0
      ? await planRepo.listBillableForCards(creditCardIds, boundary)
      : [];

  await prisma.$transaction(async (tx) => {
    for (const s of opens) await statementRepo.saveWithTx(tx, s);
    if (primary && billable.length > 0) {
      await planRepo.stampBillableWithTx(
        tx,
        billable.map((c) => c.paymentId),
        primary.id,
      );
    }
  });
  return events;
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
    @Inject(INSTALLMENT_PLAN_REPOSITORY)
    private readonly planRepo: InstallmentPlanRepositoryPort,
    private readonly prisma: PrismaService,
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
    const events = await closeIfDue(account, this.statementRepo, this.planRepo, this.prisma);
    return { result: events.length > 0, events };
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
    @Inject(INSTALLMENT_PLAN_REPOSITORY)
    private readonly planRepo: InstallmentPlanRepositoryPort,
    private readonly prisma: PrismaService,
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
    const events: StatementClosedEvent[] = [];
    // The count is of ACCOUNTS closed this run — a cycle closing both its CLP and
    // USD periods is one account billed.
    let accountsClosed = 0;
    for (const account of accounts) {
      const closed = await closeIfDue(account, this.statementRepo, this.planRepo, this.prisma);
      if (closed.length > 0) accountsClosed++;
      events.push(...closed);
    }
    return { result: accountsClosed, events };
  }
}
