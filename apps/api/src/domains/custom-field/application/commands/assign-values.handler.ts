import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { customFields } from "@finance/contracts";

import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../../idempotency-record/domain/ports/idempotency-record.repository.port";
import {
  TRANSACTION_FIELD_VALUE_REPOSITORY,
  type FieldValue,
  type TransactionFieldValueRepositoryPort,
} from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import {
  TRANSACTION_SCOPE_LOOKUP,
  type TransactionScopeLookupPort,
} from "../../../transaction/domain/ports/transaction-scope-lookup.port";
import type { CustomField } from "../../domain/custom-field.aggregate";
import { CustomFieldNotFoundError } from "../../domain/errors";
import {
  CUSTOM_FIELD_REPOSITORY,
  type CustomFieldRepositoryPort,
} from "../../domain/ports/custom-field.repository.port";
import { changedBy, planAssignment, type AssignmentPlan } from "../assignment";
import { AssignValuesCommand } from "./custom-field.commands";

interface Context {
  field: CustomField;
  plan: AssignmentPlan;
  value: FieldValue | null;
}

/**
 * Gives many movements one value of a field at once (FR-015/016), leaving out those
 * it doesn't apply to and reporting how many. Only movements whose value actually
 * changes are written, and the response lists what each one held before — what
 * "Deshacer" sends back (FR-016b). Retry safety (Principle VII, form (c)): the
 * client's `Idempotency-Key`, so a replay answers the very same response —
 * including that `previous` list — instead of an empty one.
 */
@Injectable()
@CommandHandler(AssignValuesCommand)
export class AssignValuesHandler extends BaseIdempotentCommandHandler<
  AssignValuesCommand,
  customFields.AssignValuesResponse,
  Context
> {
  protected readonly operation = "customField.assign";

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    private readonly prisma: PrismaService,
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly fields: CustomFieldRepositoryPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly values: TransactionFieldValueRepositoryPort,
    @Inject(TRANSACTION_SCOPE_LOOKUP) private readonly movements: TransactionScopeLookupPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: AssignValuesCommand): unknown {
    return { fieldId: command.fieldId, ...command.body };
  }

  protected async loadContext(command: AssignValuesCommand): Promise<Context> {
    const field = await this.fields.findOwned(command.userId, command.fieldId);
    if (!field) throw new CustomFieldNotFoundError();
    const value =
      command.body.value === null ? null : field.parseValue(command.body.value, "value");
    const plan = await planAssignment(
      { fields: this.fields, values: this.values, movements: this.movements, cards: this.cards },
      command.userId,
      field,
      command.body.target,
    );
    return { field, plan, value };
  }

  protected async handleIdempotent(
    command: AssignValuesCommand,
    { field, plan, value }: Context,
    complete: CompleteFn<customFields.AssignValuesResponse>,
  ): Promise<HandleResult<customFields.AssignValuesResponse>> {
    const changed = changedBy(plan, value);
    const result: customFields.AssignValuesResponse = {
      changed: changed.length,
      skipped: plan.outOfScope,
      previous: changed.map((transactionId) => ({
        transactionId,
        value: plan.current.get(transactionId) ?? null,
      })),
    };
    await this.prisma.$transaction(
      async (tx) => {
        if (value === null) {
          await this.values.deleteManyWithTx(tx, command.userId, field.id, changed);
        } else {
          await this.values.setManyWithTx(tx, command.userId, field, changed, value);
        }
        await complete(tx, result);
      },
      { timeout: 30_000 },
    );
    return { result, events: [] };
  }
}
