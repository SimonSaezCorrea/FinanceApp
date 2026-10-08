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
import {
  StatementDatesInvalidError,
  StatementDatesLockedError,
  StatementNotFoundError,
  StatementPeriodOverlapsError,
} from "../../domain/errors";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import { UpdateStatementDatesCommand } from "./update-statement-dates.command";

/** Upper bound of "everything after the close" when moving later movements on. */
const FAR_FUTURE = new Date(Date.UTC(9999, 11, 31));

interface Context {
  account: BankAccount;
  /** The statement and its siblings in other currencies: generated together, they
   * share their dates (spec 028, the cycle belongs to the account). */
  group: CreditStatement[];
  /** The account's OPEN periods, which start right after the latest close. Only
   * loaded when the close moves. */
  opens: CreditStatement[];
  /** The start or the close moves (not just the due date). */
  windowMoves: boolean;
  closeMoves: boolean;
  /** The statement is the OPEN period: only its dates are scheduled, nothing closes. */
  scheduleOnly: boolean;
}

const isSettled = (s: CreditStatement) => s.paidAt !== null || s.transferredAt !== null;

/**
 * "Editar fechas" of a generated statement. Same rules as generating it, plus what
 * the period has become since:
 *  - the due date can always change (it only informs);
 *  - the start and close only while every sibling is unsettled: a settled period's
 *    total froze at its movements, moving its window would rewrite paid money;
 *  - the close only on the account's latest statement: the next closed period
 *    starts where this one ends, and two periods must never claim the same days.
 *
 * On the OPEN period it only SCHEDULES: start, close and due date are saved on it
 * (and its siblings in other currencies), it stays open, no period is created —
 * the statement is generated when that close arrives (hourly cron) or earlier,
 * from "Generar facturación".
 *
 * When the window moves, in ONE `$transaction`: movements dated inside it are linked
 * to the period, those after the close go to the open period (whose start follows
 * the close), and the instalments follow the close too: un-billed when now due
 * after it, billed when now due before it.
 */
@Injectable()
@CommandHandler(UpdateStatementDatesCommand)
export class UpdateStatementDatesHandler extends BaseCommandHandler<
  UpdateStatementDatesCommand,
  void,
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

  protected async loadContext(command: UpdateStatementDatesCommand): Promise<Context> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    const statement = await this.statementRepo.findById(
      command.userId,
      command.accountId,
      command.statementId,
    );
    if (!statement) throw new StatementNotFoundError();
    const currentClose = statement.closedAt;

    const { periodStart, closedAt, dueDate } = command;
    if (closedAt.getTime() <= periodStart.getTime() || dueDate.getTime() < closedAt.getTime()) {
      throw new StatementDatesInvalidError();
    }
    if (!currentClose) {
      // The open period: schedule its dates, after the account's last close.
      const all = await this.statementRepo.listForAccount(command.userId, account.id);
      const lastClose = all.reduce(
        (max, s) => (s.closedAt && s.closedAt > max ? s.closedAt : max),
        new Date(0),
      );
      if (periodStart.getTime() < lastClose.getTime()) throw new StatementPeriodOverlapsError();
      const opens = await this.statementRepo.listOpenForAccount(account.id);
      return {
        account,
        group: opens,
        opens: [],
        windowMoves: false,
        closeMoves: false,
        scheduleOnly: true,
      };
    }

    const all = await this.statementRepo.listForAccount(command.userId, account.id);
    const group = all.filter((s) => s.closedAt?.getTime() === currentClose.getTime());
    const closeMoves = closedAt.getTime() !== currentClose.getTime();
    const windowMoves = closeMoves || periodStart.getTime() !== statement.periodStart.getTime();

    if (windowMoves && group.some(isSettled)) throw new StatementDatesLockedError();
    if (closeMoves && all.some((s) => s.closedAt && s.closedAt > currentClose)) {
      throw new StatementDatesLockedError();
    }
    const previousClose = all.reduce(
      (max, s) => (s.closedAt && s.closedAt < currentClose && s.closedAt > max ? s.closedAt : max),
      new Date(0),
    );
    if (periodStart.getTime() < previousClose.getTime()) throw new StatementPeriodOverlapsError();

    const opens = closeMoves ? await this.statementRepo.listOpenForAccount(account.id) : [];
    return { account, group, opens, windowMoves, closeMoves, scheduleOnly: false };
  }

  protected async handle(
    command: UpdateStatementDatesCommand,
    { account, group, opens, windowMoves, closeMoves, scheduleOnly }: Context,
  ): Promise<HandleResult<void>> {
    const { periodStart, closedAt, dueDate } = command;
    if (scheduleOnly) {
      for (const s of group) s.scheduleClose({ periodStart, closedAt, dueDate });
      await this.prisma.$transaction(async (tx) => {
        for (const s of group) await this.statementRepo.saveWithTx(tx, s);
      });
      return { result: undefined, events: [] };
    }
    const snap = account.snapshot();
    // Same scoping as generation / sync.
    const cardIds =
      snap.type === "CREDIT_CARD"
        ? null
        : snap.cards.filter((c) => c.kind === "CREDIT").map((c) => c.id);
    const creditCardIds = snap.cards.filter((c) => c.kind === "CREDIT").map((c) => c.id);
    const primary = group.find((s) => s.currency === snap.currency) ?? null;
    const billable =
      closeMoves && primary && creditCardIds.length > 0
        ? await this.planRepo.listBillableForCards(creditCardIds, closedAt)
        : [];

    for (const s of group) s.changeDates({ periodStart, closedAt, dueDate });
    const nextStart = new Date(closedAt.getTime() + 1);

    await this.prisma.$transaction(async (tx) => {
      for (const s of group) {
        await this.statementRepo.saveWithTx(tx, s);
        if (!windowMoves) continue;
        await this.transactions.relinkToStatementWithTx(tx, {
          statementId: s.id,
          accountId: account.id,
          cardIds,
          from: periodStart,
          to: closedAt,
          currency: s.currency,
        });
        if (!closeMoves) continue;
        const nextId = await this.nextPeriodWithTx(tx, account.id, s, opens, nextStart);
        await this.transactions.relinkToStatementWithTx(tx, {
          statementId: nextId,
          accountId: account.id,
          cardIds,
          from: closedAt,
          to: FAR_FUTURE,
          currency: s.currency,
        });
      }
      if (closeMoves && primary) {
        await this.planRepo.unstampDueAfterWithTx(tx, primary.id, closedAt);
        if (billable.length > 0) {
          await this.planRepo.stampBillableWithTx(
            tx,
            billable.map((c) => c.paymentId),
            primary.id,
          );
        }
      }
    });
    return { result: undefined, events: [] };
  }

  /** The open period of `s`'s currency, its start moved to follow the new close;
   * created when that currency has none. */
  private async nextPeriodWithTx(
    tx: unknown,
    accountId: string,
    s: CreditStatement,
    opens: CreditStatement[],
    nextStart: Date,
  ): Promise<string> {
    const open = opens.find((o) => o.currency === s.currency);
    if (open) {
      open.reanchor(nextStart);
      await this.statementRepo.saveWithTx(tx, open);
      return open.id;
    }
    const created = await this.statementRepo.findOrCreateCarryOverTargetWithTx(tx, {
      accountId,
      excludeStatementId: s.id,
      periodStart: nextStart,
      currency: s.currency,
    });
    return created.id;
  }
}
