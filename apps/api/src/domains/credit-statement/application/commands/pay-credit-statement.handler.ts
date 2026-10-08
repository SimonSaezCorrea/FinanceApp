import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { subtractMoney, toMoney } from "@finance/money";

import {
  CATEGORY_LOOKUP,
  type CategoryLookupPort,
} from "../../../category/domain/ports/category-lookup.port";
import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
import { generateRowId } from "../../../../infra/id/generate-row-id";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../../idempotency-record/domain/ports/idempotency-record.repository.port";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import type { BankAccount } from "../../../bank-account/domain/bank-account.aggregate";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../../installment-plan/domain/ports/installment-plan.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import type { accounts } from "@finance/contracts";

import {
  InvalidPaymentSourceError,
  NothingToPayError,
  StatementNotFoundError,
} from "../../domain/errors";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import { planForeignSettlement } from "../foreign-settlement";
import { toStatementDto } from "../statement-dto.mapper";
import { PayCreditStatementCommand } from "./pay-credit-statement.command";

interface Context {
  account: BankAccount;
  fromAccount: BankAccount;
  /** The breakdown as read BEFORE the row lock — safe to read early because concurrent
   * payments never change purchases/instalments, only the statement's own paid state
   * (which the lock DOES protect — see `handleIdempotent`). */
  breakdown: { purchases: string; installments: string; installmentCount: number };
  paymentTransactionId: string;
  /** Spec 030: id of the settlement INCOME of a statement in another currency. */
  settlementTransactionId: string;
  now: Date;
  /** Business date of the payment — what the created expense is dated with. */
  occurredAt: Date;
  reference?: string;
}

export type PaidStatementResult = accounts.CreditStatement;

/**
 * Pays a statement by choosing a source bank account: creates a real EXPENSE
 * `Transaction`, decrements the credit account's `creditUsed`, and freezes
 * the statement PAID — one atomic action touching THREE aggregates
 * (`CreditStatement`, the new payment `Transaction`, `BankAccount`), all inside one
 * `prisma.$transaction(...)` (FR-020, T029a) rather than three independent `save()` calls.
 *
 * Spec 014, FR-014/FR-015: liquidating the period ALSO settles every instalment it
 * charged, in that same transaction — whether the payment was full or short. A
 * shortfall's debt lives in `carryOver` (rolled onto the successor period, above);
 * doubling it onto the instalment as well would count it twice, which is exactly
 * what Constitution I's carry-over rule forbids.
 *
 * Spec 030 (absorbing spec 028 US2): a statement in ANOTHER currency than its account's
 * is paid with two amounts — the statement's own (`amount`) and what left the source
 * account (`chargedAmount`, in ITS currency); they are never compared. It writes the
 * source EXPENSE plus an INCOME on the card that owns that currency's limit (what lowers
 * its usage), and never touches the account's `creditUsed`.
 */
@Injectable()
@CommandHandler(PayCreditStatementCommand)
export class PayCreditStatementHandler extends BaseIdempotentCommandHandler<
  PayCreditStatementCommand,
  PaidStatementResult,
  Context
> {
  protected readonly operation = "creditStatement.pay";
  protected override readonly successStatus = 200;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statementRepo: CreditStatementRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plans: InstallmentPlanRepositoryPort,
    private readonly prisma: PrismaService,
    @Inject(CATEGORY_LOOKUP) private readonly categories: CategoryLookupPort,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: PayCreditStatementCommand): unknown {
    return {
      accountId: command.accountId,
      statementId: command.statementId,
      fromAccountId: command.fromAccountId,
      amount: command.amount,
      paidAt: command.paidAt,
      reference: command.reference,
      chargedAmount: command.chargedAmount,
    };
  }

  protected async loadContext(command: PayCreditStatementCommand): Promise<Context> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    // Existence check only — the authoritative, LOCKED read happens inside the
    // transaction (see `handleIdempotent`). This just fails fast before touching the
    // source account at all.
    const exists = await this.statementRepo.findById(
      command.userId,
      command.accountId,
      command.statementId,
    );
    if (!exists) throw new StatementNotFoundError();
    const fromAccount = await this.accountRepo.findById(command.userId, command.fromAccountId);
    if (!fromAccount) throw new AccountNotFoundError();
    if (fromAccount.type === "CREDIT_CARD") throw new InvalidPaymentSourceError();
    const breakdown = await this.statementRepo.breakdown(command.statementId);
    const now = new Date();
    return {
      account,
      fromAccount,
      breakdown,
      paymentTransactionId: generateRowId(),
      settlementTransactionId: generateRowId(),
      now,
      occurredAt: command.paidAt ?? now,
      reference: command.reference,
    };
  }

  // Cross-aggregate persistence (FR-020, contracts/layer-contracts.md): several tables
  // plus the idempotency record in one atomic step. Each write goes through the port of
  // the domain that owns its table (`transaction`, `credit-statement`, `bank-account`) —
  // this handler only supplies the shared `$transaction` they all enlist in, so all of
  // them commit or roll back together.
  protected async handleIdempotent(
    command: PayCreditStatementCommand,
    context: Context,
    complete: CompleteFn<PaidStatementResult>,
  ): Promise<HandleResult<PaidStatementResult>> {
    return await this.prisma.$transaction(async (tx) => {
      // Locked read: the ONLY read of the statement's paid state that matters. Two
      // simultaneous payments with DIFFERENT idempotency keys serialize here (the
      // reservation only serializes retries of the SAME key), so the second one sees the
      // first's settlement instead of validating against the same stale remaining.
      const statement = await this.statementRepo.findByIdForUpdateWithTx(
        tx,
        command.userId,
        command.accountId,
        command.statementId,
      );
      if (!statement) throw new StatementNotFoundError();

      // The period's total: frozen once settled, still the live sum otherwise.
      // Spec 014, FR-010: the instalments this period billed are a summand of their
      // own — omitting them here would settle the period for its purchases alone and
      // leave the instalments' debt sitting nowhere.
      const periodAmount = statement.paidAt
        ? statement.amount
        : statement.totalFor(context.breakdown.purchases, context.breakdown.installments);
      if (!toMoney(periodAmount).greaterThan(0)) throw new NothingToPayError();
      // No explicit amount = settle whatever is still owed. The aggregate is what
      // validates it (positive, not more than remaining) — see `payTowards`.
      const amount = command.amount ?? statement.remainingFor(periodAmount);

      // A statement in ANOTHER currency has its own limit (a card's `CardLimit`) and no
      // share of the account's pool — settling it is two movements and `creditUsed` stays.
      const foreign = statement.currency !== context.account.snapshot().currency;
      const settlement = foreign
        ? planForeignSettlement({
            account: context.account,
            fromAccount: context.fromAccount,
            statementId: statement.id,
            currency: statement.currency,
            amount,
            chargedAmount: command.chargedAmount,
            occurredAt: context.occurredAt,
            reference: context.reference,
            categoryId: await this.categories.idForSystemCode("STATEMENT_PAYMENT"),
            expenseId: context.paymentTransactionId,
            incomeId: context.settlementTransactionId,
          })
        : null;

      const { event, carryOver } = statement.payTowards(
        periodAmount,
        amount,
        command.fromAccountId,
        context.paymentTransactionId,
        context.occurredAt,
        settlement ? context.settlementTransactionId : null,
      );
      // Only what was actually paid comes off the credit pool: paying the minimum
      // frees exactly that, and the shortfall stays used — it is still owed, just
      // in the next period now.
      if (!foreign) context.account.adjustCreditUsed(toMoney(amount).negated().toString());

      const result = toStatementDto(statement, {
        amount: periodAmount,
        breakdown: context.breakdown,
        minimumPercent: context.account.minimumPaymentPercent,
        paymentDueDay: context.account.paymentDueDay,
        paymentDueCycleType: context.account.paymentDueCycleType,
        billingCycleDay: context.account.billingCycleDay,
        billingCycleType: context.account.billingCycleType,
        accountCurrency: context.account.snapshot().currency,
      });

      if (settlement) {
        await this.transactions.createWithTx(tx, settlement.expense);
        await this.transactions.createWithTx(tx, settlement.income);
        await this.accountRepo.incrementBalanceWithTx(
          tx,
          context.fromAccount.id,
          subtractMoney("0", settlement.charged),
        );
      } else {
        await this.transactions.createWithTx(tx, {
          id: context.paymentTransactionId,
          userId: context.account.userId,
          bankAccountId: context.fromAccount.id,
          type: "EXPENSE",
          amount,
          currency: context.account.snapshot().currency,
          occurredAt: context.occurredAt,
          categoryId: await this.categories.idForSystemCode("STATEMENT_PAYMENT"),
          description: context.account.name,
          // The user's reference for this payment (a transfer number, say) rides on
          // the movement itself, where they'll look for it later.
          observation: context.reference,
        });
        // Paying is when the cash actually leaves: the purchases themselves moved
        // no balance (they were charged to the credit line, see `cashDelta`), so
        // this single EXPENSE is what the source account's balance must follow.
        await this.accountRepo.incrementBalanceWithTx(
          tx,
          context.fromAccount.id,
          subtractMoney("0", amount),
        );
      }

      // A payment smaller than the period never leaves it half-paid: the period
      // is settled and the shortfall becomes the next period's `carriedOverAmount`
      // (its own OPEN one, or a fresh period starting where this one closed) — in the
      // period's OWN currency.
      if (toMoney(carryOver).greaterThan(0)) {
        const target = await this.statementRepo.findOrCreateCarryOverTargetWithTx(tx, {
          accountId: context.account.id,
          excludeStatementId: statement.id,
          periodStart: statement.closedAt ?? context.occurredAt,
          currency: statement.currency,
        });
        statement.markCarriedTo(target.id);
        await this.statementRepo.addCarriedOverWithTx(tx, target.id, carryOver);
      }
      await this.statementRepo.saveWithTx(tx, statement);
      if (!foreign) await this.accountRepo.saveWithTx(tx, context.account);
      // FR-014: settle EVERY instalment this period charged, regardless of whether
      // this payment covered the whole period — "settled" is decided by the fact
      // of payment (`paidAt !== null`), never by the resulting status name.
      await this.plans.settleForStatementWithTx(tx, statement.id, context.occurredAt);
      await complete(tx, result);

      return { result, events: [event] };
    });
  }
}
