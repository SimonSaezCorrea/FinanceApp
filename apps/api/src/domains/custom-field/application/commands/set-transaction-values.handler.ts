import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { customFields } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  TRANSACTION_FIELD_VALUE_REPOSITORY,
  type FieldValue,
  type FieldValueWrite,
  type TransactionFieldValueRepositoryPort,
} from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import {
  TRANSACTION_SCOPE_LOOKUP,
  type TransactionScopeLookupPort,
} from "../../../transaction/domain/ports/transaction-scope-lookup.port";
import {
  CustomFieldNotApplicableError,
  CustomFieldNotFoundError,
  CustomFieldTransactionNotFoundError,
} from "../../domain/errors";
import {
  CUSTOM_FIELD_REPOSITORY,
  type CustomFieldRepositoryPort,
} from "../../domain/ports/custom-field.repository.port";
import { shapeOf } from "../scope";
import { SetTransactionValuesCommand } from "./custom-field.commands";

interface Context {
  writes: FieldValueWrite[];
  clears: string[];
}

type Result = { customFields: Record<string, customFields.CustomFieldValue> };

/**
 * Edits the custom field values of ONE movement (FR-009/012). It never goes through
 * the movement's own update, so a movement that is read-only for other reasons (it
 * backs an instalment, a statement payment) can still be labelled — and nothing
 * else about it changes: no balance, pool or period. A field that doesn't apply may
 * still be cleared when the movement holds a value for it (it left the scope later).
 * Retry safety (Principle VII, form (b)): absolute writes on the unique
 * `(transactionId, customFieldId)`.
 */
@Injectable()
@CommandHandler(SetTransactionValuesCommand)
export class SetTransactionValuesHandler extends BaseCommandHandler<
  SetTransactionValuesCommand,
  Result,
  Context
> {
  constructor(
    eventBus: EventBus,
    private readonly prisma: PrismaService,
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly fields: CustomFieldRepositoryPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly values: TransactionFieldValueRepositoryPort,
    @Inject(TRANSACTION_SCOPE_LOOKUP) private readonly movements: TransactionScopeLookupPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: SetTransactionValuesCommand): Promise<Context> {
    const { userId, transactionId } = command;
    const [facts] = await this.movements.factsFor(userId, [transactionId]);
    if (!facts) throw new CustomFieldTransactionNotFoundError();
    const [fields, cardKinds, held] = await Promise.all([
      this.fields.listForUser(userId),
      this.cards.kindsForUser(userId),
      this.values.listForTransactions(userId, [transactionId]),
    ]);
    const current: Record<string, FieldValue> = held.get(transactionId) ?? {};
    const shape = shapeOf(facts, cardKinds);
    const byId = new Map(fields.map((f) => [f.id, f]));

    const writes: FieldValueWrite[] = [];
    const clears: string[] = [];
    for (const [fieldId, raw] of Object.entries(command.values)) {
      const field = byId.get(fieldId);
      if (!field) throw new CustomFieldNotFoundError();
      const hasValue = fieldId in current;
      if (raw === null) {
        if (hasValue) clears.push(fieldId);
        continue;
      }
      if (!hasValue && !field.appliesTo(shape)) {
        throw new CustomFieldNotApplicableError(`values.${fieldId}`);
      }
      const value = field.parseValue(raw, `values.${fieldId}`);
      // Rewriting the same value would only wipe a "Transferir pendientes" link.
      if (current[fieldId] === value) continue;
      writes.push({ transactionId, customFieldId: fieldId, type: field.type, value });
    }
    return { writes, clears };
  }

  protected async handle(
    command: SetTransactionValuesCommand,
    { writes, clears }: Context,
  ): Promise<HandleResult<Result>> {
    const { userId, transactionId } = command;
    await this.prisma.$transaction(async (tx) => {
      await this.values.upsertManyWithTx(tx, userId, writes);
      for (const fieldId of clears) {
        await this.values.deleteManyWithTx(tx, userId, fieldId, [transactionId]);
      }
    });
    const after = await this.values.listForTransactions(userId, [transactionId]);
    return { result: { customFields: after.get(transactionId) ?? {} }, events: [] };
  }
}
