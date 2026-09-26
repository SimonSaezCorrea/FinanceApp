import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { imports } from "@finance/contracts";

import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import { assertSelectableCategory } from "../../../category/domain/category-policy";
import {
  CARD_LIMIT_REPOSITORY,
  type CardLimitRepositoryPort,
} from "../../../card-limit/domain/ports/card-limit.repository.port";
import { currentCycleStart } from "../../../billing-settings/domain/billing-cycle";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../../transaction/domain/ports/transaction.repository.port";
import {
  CATEGORY_LOOKUP,
  type CategoryLookupPort,
} from "../../../category/domain/ports/category-lookup.port";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../../credit-statement/domain/ports/credit-statement.repository.port";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../../idempotency-record/domain/ports/idempotency-record.repository.port";
import { loadAccountContext } from "../../../transaction/application/account-context.loader";
import { AccountNotFoundError } from "../../../transaction/domain/errors";
import type { AccountContext } from "../../../transaction/domain/movement-policy";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import { planImport, type ImportCard, type ImportPlan } from "../../domain/import-plan";
import { ImportTransactionsCommand } from "./import-transactions.command";

interface Context {
  plan: ImportPlan;
  currency: string;
  creditStatementId: string | null;
}

/**
 * Imports a spreadsheet's movements into ONE account, applied exactly like
 * movements created by hand (`planImport` runs `MovementPolicy` row by row over
 * a running balance/credit pool). All-or-nothing: the rows, the balance delta,
 * the credit-pool delta and the idempotency mark commit in one `$transaction` —
 * as a bulk insert plus ONE increment each, so a year of movements isn't a few
 * thousand round trips.
 *
 * Retry-safe (Constitution VII, form (c)): same `Idempotency-Key` protocol as
 * `POST /transactions` — a double click or a retried request can't import the
 * file twice. Re-importing the SAME file later is a new attempt and does import
 * it again; duplicate detection was deliberately left out (two identical coffees
 * on the same day are real).
 */
@Injectable()
@CommandHandler(ImportTransactionsCommand)
export class ImportTransactionsHandler extends BaseIdempotentCommandHandler<
  ImportTransactionsCommand,
  imports.ImportResult,
  Context
> {
  protected readonly operation = "import.transactions";
  protected override readonly successStatus = 201;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    @Inject(CARD_LIMIT_REPOSITORY) private readonly cardLimits: CardLimitRepositoryPort,
    @Inject(TRANSACTION_REPOSITORY) private readonly movements: TransactionRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY) private readonly statements: CreditStatementRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    @Inject(CATEGORY_LOOKUP) private readonly categories: CategoryLookupPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: ImportTransactionsCommand): unknown {
    return command.input;
  }

  protected async loadContext(command: ImportTransactionsCommand): Promise<Context> {
    const { input, userId } = command;
    // Ownership first (Principle II): a foreign account is simply not found.
    const account = await this.accounts.findById(userId, input.bankAccountId);
    const loaded = account
      ? await loadAccountContext(this.accounts, userId, input.bankAccountId)
      : null;
    if (!account || !loaded) throw new AccountNotFoundError();

    // Same category rule as a single movement, once per distinct (category, type).
    const checks = new Set(
      input.rows.filter((r) => r.categoryId).map((r) => `${r.categoryId}|${r.type}`),
    );
    for (const check of checks) {
      const [categoryId, type] = check.split("|") as [string, "INCOME" | "EXPENSE"];
      await assertSelectableCategory(this.categories, categoryId, type);
    }

    const currency = account.snapshot().currency;
    const cards = await this.accountCards(userId, input.bankAccountId, currency, loaded.context);
    const plan = planImport(input.rows, { ...loaded.context, currency }, cards);

    const creditStatementId = plan.rows.some((r) => r.drawsOnCredit)
      ? (await this.statements.findOrCreateOpenForAccount(input.bankAccountId, loaded.createdAt)).id
      : null;

    return { plan, currency, creditStatementId };
  }

  protected async handleIdempotent(
    command: ImportTransactionsCommand,
    context: Context,
    complete: CompleteFn<imports.ImportResult>,
  ): Promise<HandleResult<imports.ImportResult>> {
    const { userId, input } = command;
    const { plan } = context;

    const result = await this.prisma.$transaction(async (tx) => {
      const imported = await this.transactions.createManyWithTx(
        tx,
        plan.rows.map((r) => ({
          userId,
          bankAccountId: input.bankAccountId,
          type: r.type,
          amount: r.amount,
          currency: context.currency,
          occurredAt: r.occurredAt,
          description: r.description,
          observation: r.observation,
          emisor: r.emisor,
          receptor: r.receptor,
          lugar: r.lugar,
          categoryId: r.categoryId,
          cardId: r.cardId,
          financeCharge: r.financeCharge,
          creditStatementId: r.drawsOnCredit ? context.creditStatementId : null,
        })),
      );
      if (Number(plan.cashTotal) !== 0) {
        await this.accounts.incrementBalanceWithTx(tx, input.bankAccountId, plan.cashTotal);
      }
      if (Number(plan.creditTotal) !== 0) {
        await this.accounts.incrementCreditUsedWithTx(tx, input.bankAccountId, plan.creditTotal);
      }
      const body = { imported };
      await complete(tx, body);
      return body;
    });

    return { result, events: [] };
  }

  /**
   * Every card of the account, with what the movement rules need to judge a row
   * charged to it: a CREDIT card's own sub-limit in the account's currency (when it
   * has one) and what it has used against it this cycle — the same inputs
   * `CreateTransactionHandler` loads for a single movement.
   */
  private async accountCards(
    userId: string,
    accountId: string,
    currency: string,
    account: Pick<AccountContext, "billingCycleDay" | "billingCycleType">,
  ): Promise<ImportCard[]> {
    const cards = await this.cards.listByAccounts([accountId]);
    const limits = await this.cardLimits.listByCards(cards.map((c) => c.id));
    const since = currentCycleStart(account.billingCycleDay, account.billingCycleType, new Date());
    return Promise.all(
      cards.map(async (c) => {
        const own = limits.find((l) => l.cardId === c.id && l.currency === currency) ?? null;
        const limit =
          c.kind === "CREDIT" && own
            ? { limitAmount: own.limitAmount, usedInitial: own.usedInitial }
            : null;
        const usage = limit
          ? await this.movements.sumsForCard(userId, c.id, currency, since)
          : { income: "0", expense: "0" };
        return { id: c.id, kind: c.kind, isPrimary: c.isPrimary, limit, usage };
      }),
    );
  }
}
