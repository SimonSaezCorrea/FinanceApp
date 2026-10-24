import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { customFields, type transactions } from "@finance/contracts";
import { sumMoney } from "@finance/money";

import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
import { generateRowId } from "../../../../infra/id/generate-row-id";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../../credit-statement/domain/ports/credit-statement.repository.port";
import type { CustomField } from "../../../custom-field/domain/custom-field.aggregate";
import {
  CustomFieldAssignmentTooLargeError,
  CustomFieldNotFoundError,
} from "../../../custom-field/domain/errors";
import {
  CUSTOM_FIELD_REPOSITORY,
  type CustomFieldRepositoryPort,
} from "../../../custom-field/domain/ports/custom-field.repository.port";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../../idempotency-record/domain/ports/idempotency-record.repository.port";
import {
  TRANSACTION_FIELD_VALUE_REPOSITORY,
  type TransactionFieldValueRepositoryPort,
} from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import {
  CoverFieldNotBooleanError,
  CoverSelectionChangedError,
  CoverSelectionInvalidError,
} from "../../domain/errors";
import {
  TRANSACTION_SCOPE_LOOKUP,
  type MovementFacts,
  type TransactionScopeLookupPort,
} from "../../domain/ports/transaction-scope-lookup.port";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { TransferPolicy, type TransferAccountContext } from "../../domain/transfer-policy";
import { resolveListFilter } from "../queries/transaction-list-filter";
import { writeTransferPairWithTx } from "../transfer-legs";
import { CoverWithTransferCommand } from "./cover-with-transfer.command";
import { loadTransferAccounts, toTransferContract } from "./create-transfer.handler";

interface Context {
  field: CustomField;
  ids: string[];
  amount: string;
  currency: string;
  from: TransferAccountContext;
  to: TransferAccountContext;
}

/**
 * "Transferir pendientes" (specs/036, US6): ONE transfer between two of the
 * person's accounts for the sum of the chosen movements, which then take `value`
 * in a yes/no field, each remembering the transfer and what it held before — so
 * deleting the transfer gives every one of them its previous value back (FR-025).
 *
 * All the movements must be one type (all expenses or all incomes, never transfer
 * legs), in the field's scope and in one currency, that of both accounts. The
 * transfer is validated exactly like one made by hand (`TransferPolicy`).
 *
 * Retry safety (Principle VII, form (c)): the client's `Idempotency-Key`; the
 * transfer, the values and the COMPLETED mark commit in ONE transaction. Two covers
 * with different keys racing over the same movements: the value rows are locked
 * (`FOR UPDATE`) and a row inserted meanwhile collides on its unique key, so the
 * second one fails with `COVER_SELECTION_CHANGED` instead of moving money twice.
 */
@Injectable()
@CommandHandler(CoverWithTransferCommand)
export class CoverWithTransferHandler extends BaseIdempotentCommandHandler<
  CoverWithTransferCommand,
  transactions.CoverTransferResponse,
  Context
> {
  protected readonly operation = "transaction.coverTransfer";
  protected override readonly successStatus = 201;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort,
    @Inject(TRANSACTION_SCOPE_LOOKUP) private readonly movements: TransactionScopeLookupPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statements: CreditStatementRepositoryPort,
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly fields: CustomFieldRepositoryPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly values: TransactionFieldValueRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: CoverWithTransferCommand): unknown {
    return command.input;
  }

  protected async loadContext(command: CoverWithTransferCommand): Promise<Context> {
    const { userId, input } = command;
    const field = await this.fields.findOwned(userId, input.fieldId);
    if (!field) throw new CustomFieldNotFoundError();
    if (field.type !== "BOOLEAN") throw new CoverFieldNotBooleanError();

    const facts = await this.movements.factsFor(userId, await this.targetIds(userId, input));
    const currency = this.checkSelection(field, facts, await this.cards.kindsForUser(userId));

    const { from, to } = await loadTransferAccounts(
      this.accounts,
      userId,
      input.fromBankAccountId,
      input.toBankAccountId,
    );
    if (from && to && (from.currency !== currency || to.currency !== currency)) {
      throw new CoverSelectionInvalidError("currencyMismatch");
    }
    const amount = sumMoney(facts.map((f) => f.amount));
    TransferPolicy.validate(
      {
        fromBankAccountId: input.fromBankAccountId,
        toBankAccountId: input.toBankAccountId,
        amountOut: amount,
        amountIn: amount,
      },
      from,
      to,
    );
    return { field, ids: facts.map((f) => f.id), amount, currency, from: from!, to: to! };
  }

  private async targetIds(userId: string, input: transactions.CoverTransfer): Promise<string[]> {
    const max = customFields.CUSTOM_FIELD_ASSIGNMENT_MAX;
    if ("ids" in input.target) return [...new Set(input.target.ids)];
    const where = await resolveListFilter(
      { fields: this.fields, values: this.values, cards: this.cards },
      userId,
      input.target.filter,
    );
    const except = new Set(input.target.exceptIds ?? []);
    const ids = (await this.movements.idsForFilter(userId, where, max + 1 + except.size)).filter(
      (id) => !except.has(id),
    );
    if (ids.length > max) throw new CustomFieldAssignmentTooLargeError();
    return ids;
  }

  /** The movements can be covered by one transfer: returns their one currency. */
  private checkSelection(
    field: CustomField,
    facts: MovementFacts[],
    cardKinds: ReadonlyMap<string, customFields.CustomFieldCardKind>,
  ): string {
    if (facts.length === 0) throw new CoverSelectionInvalidError("empty");
    if (facts.some((f) => f.transferGroupId)) throw new CoverSelectionInvalidError("transferLegs");
    const outOfScope = facts.some(
      (f) =>
        !field.appliesTo({
          kind: f.type,
          bankAccountId: f.bankAccountId,
          cardKind: f.cardId ? (cardKinds.get(f.cardId) ?? null) : null,
        }),
    );
    if (outOfScope) throw new CoverSelectionInvalidError("outOfScope");
    if (new Set(facts.map((f) => f.type)).size > 1)
      throw new CoverSelectionInvalidError("mixedTypes");
    const currencies = new Set(facts.map((f) => f.currency));
    if (currencies.size > 1) throw new CoverSelectionInvalidError("mixedCurrencies");
    return facts[0]!.currency;
  }

  protected async handleIdempotent(
    command: CoverWithTransferCommand,
    context: Context,
    complete: CompleteFn<transactions.CoverTransferResponse>,
  ): Promise<HandleResult<transactions.CoverTransferResponse>> {
    const { userId, input } = command;
    const { field, ids, amount, currency } = context;
    const transferGroupId = generateRowId();

    const result = await this.prisma
      .$transaction(
        async (tx) => {
          const locked = await this.values.lockForCoverWithTx(tx, userId, field.id, ids);
          const changed = [...locked.values()].some(
            (v) => v.value === input.value || v.coveredByTransferGroupId !== null,
          );
          if (changed) throw new CoverSelectionChangedError();

          const pair = await writeTransferPairWithTx(
            { repo: this.repo, statements: this.statements },
            tx,
            userId,
            transferGroupId,
            {
              fromBankAccountId: input.fromBankAccountId,
              toBankAccountId: input.toBankAccountId,
              amountOut: amount,
              amountIn: amount,
              currencyOut: currency,
              currencyIn: currency,
              occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
              description: input.description ?? null,
            },
            context.from,
            context.to,
          );
          await this.values.coverWithTx(
            tx,
            userId,
            { id: field.id, type: field.type },
            input.value,
            transferGroupId,
            ids.map((transactionId) => ({
              transactionId,
              previous: locked.get(transactionId)?.value ?? null,
              existed: locked.has(transactionId),
            })),
          );
          const response: transactions.CoverTransferResponse = {
            transfer: { ...toTransferContract(pair), coveredCount: ids.length },
            covered: ids.length,
          };
          await complete(tx, response);
          return response;
        },
        { timeout: 30_000 },
      )
      .catch((err: unknown) => {
        // A value row inserted by a concurrent cover collided on its unique key.
        if ((err as { code?: unknown }).code === "P2002") throw new CoverSelectionChangedError();
        throw err;
      });
    return { result, events: [] };
  }
}
