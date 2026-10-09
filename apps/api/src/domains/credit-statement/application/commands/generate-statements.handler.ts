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
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../../installment-plan/domain/ports/installment-plan.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import type { CreditStatement } from "../../domain/credit-statement.aggregate";
import { resolveBillingEligibility } from "../../domain/billing-eligibility.strategy";
import {
  StatementDatesInvalidError,
  StatementGenerationNotAllowedError,
  StatementPeriodOverlapsError,
} from "../../domain/errors";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import { GenerateStatementsCommand } from "./generate-statements.command";

/** Upper bound of "everything after the close" when moving later movements on. */
const FAR_FUTURE = new Date(Date.UTC(9999, 11, 31));

interface Context {
  account: BankAccount;
  /** Every OPEN period of the account (one per currency), the account's own
   * currency guaranteed among them. */
  opens: CreditStatement[];
}

/**
 * "Generar facturación" with the dates printed on the bank's statement — start,
 * close and payment due date. There is no configured cycle behind it anymore (the
 * billing-cycle configuration is deferred, `docs/PENDING.md`), so nothing closes
 * on its own: the user generates each statement when the bank issues it.
 *
 * In ONE `prisma.$transaction`, for every open period (one per currency, spec 028
 * — they all close with the same dates):
 *  1. seal it with the declared dates (`CreditStatement.generate`);
 *  2. re-link the movements dated inside [start, close) to it — a movement is
 *     linked to whichever period was open when it was recorded, so a back-dated
 *     one may be sitting elsewhere (same move "Sincronizar pagos" makes);
 *  3. open the next period the day after the close and move there every movement
 *     dated after it — generating on the 25th a statement that closed on the 20th
 *     must not bill what was bought on the 22nd;
 *  4. stamp the instalments due by the close (spec 014), account currency only.
 *
 * Retry-safe (Principle VII, form (a)): replaying the same dates finds a start
 * before the close it just recorded and is refused (`STATEMENT_PERIOD_OVERLAPS`).
 */
@Injectable()
@CommandHandler(GenerateStatementsCommand)
export class GenerateStatementsHandler extends BaseCommandHandler<
  GenerateStatementsCommand,
  boolean,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statementRepo: CreditStatementRepositoryPort,
    @Inject(INSTALLMENT_PLAN_REPOSITORY)
    private readonly planRepo: InstallmentPlanRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: GenerateStatementsCommand): Promise<Context> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();

    const eligible = resolveBillingEligibility({
      accountType: account.type,
      accountStatus: account.status,
      cards: account.cards.map((c) => ({
        kind: c.kind,
        isPrimary: c.isPrimary,
        isActive: c.isActive,
      })),
    });
    if (!eligible) throw new StatementGenerationNotAllowedError();

    const { periodStart, closedAt, dueDate } = command;
    if (closedAt.getTime() <= periodStart.getTime() || dueDate.getTime() < closedAt.getTime()) {
      throw new StatementDatesInvalidError();
    }
    // A close still ahead is fine: the statement can be generated before the
    // bank's cut-off, and keeps receiving the movements dated inside it until then
    // (`findOrCreateOpenForAccount`'s `occurredAt`).

    const all = await this.statementRepo.listForAccount(command.userId, account.id);
    const lastClose = all.reduce<Date | null>(
      (max, s) => (s.closedAt && (!max || s.closedAt > max) ? s.closedAt : max),
      null,
    );
    if (lastClose && periodStart.getTime() < lastClose.getTime()) {
      throw new StatementPeriodOverlapsError();
    }

    // The account-currency period always closes, even with nothing linked yet: the
    // user is declaring that the bank issued this statement, and step 2 may fill it.
    const accountCurrency = account.snapshot().currency;
    if (!all.some((s) => !s.closedAt && s.currency === accountCurrency)) {
      await this.statementRepo.findOrCreateOpenForAccount(account.id, periodStart, accountCurrency);
    }
    const opens = await this.statementRepo.listOpenForAccount(account.id);
    return { account, opens };
  }

  protected async handle(
    command: GenerateStatementsCommand,
    { account, opens }: Context,
  ): Promise<HandleResult<boolean>> {
    const { periodStart, closedAt, dueDate } = command;
    const snap = account.snapshot();
    // Same scoping as the live pool sums / sync: on a credit card account every
    // movement belongs to its periods; elsewhere only the pool-sharing CREDIT spend.
    const cardIds =
      snap.type === "CREDIT_CARD"
        ? null
        : snap.cards.filter((c) => c.kind === "CREDIT").map((c) => c.id);
    const creditCardIds = snap.cards.filter((c) => c.kind === "CREDIT").map((c) => c.id);
    const primary = opens.find((s) => s.currency === snap.currency) ?? null;
    const billable =
      primary && creditCardIds.length > 0
        ? await this.planRepo.listBillableForCards(creditCardIds, closedAt)
        : [];

    const events = opens.map((s) => s.generate({ periodStart, closedAt, dueDate }));
    const nextStart = new Date(closedAt.getTime() + 1);

    await this.prisma.$transaction(async (tx) => {
      for (const s of opens) {
        await this.statementRepo.saveWithTx(tx, s);
        await this.transactions.relinkToStatementWithTx(tx, {
          statementId: s.id,
          accountId: account.id,
          cardIds,
          from: periodStart,
          to: closedAt,
          currency: s.currency,
        });
        const next = await this.statementRepo.findOrCreateCarryOverTargetWithTx(tx, {
          accountId: account.id,
          excludeStatementId: s.id,
          periodStart: nextStart,
          currency: s.currency,
        });
        await this.transactions.relinkToStatementWithTx(tx, {
          statementId: next.id,
          accountId: account.id,
          cardIds,
          from: closedAt,
          to: FAR_FUTURE,
          currency: s.currency,
        });
      }
      if (primary && billable.length > 0) {
        await this.planRepo.stampBillableWithTx(
          tx,
          billable.map((c) => c.paymentId),
          primary.id,
        );
      }
    });
    return { result: events.length > 0, events };
  }
}
