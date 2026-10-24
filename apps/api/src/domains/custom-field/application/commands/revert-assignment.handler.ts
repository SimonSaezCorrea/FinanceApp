import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { customFields } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
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
import { RevertAssignmentCommand } from "./custom-field.commands";

interface Context {
  field: CustomField;
  applied: FieldValue | null;
  restore: { transactionId: string; value: FieldValue | null }[];
}

/**
 * "Deshacer" of a bulk assignment (FR-016b): every movement gets back what it held
 * before — but only where it still holds what the assignment set; one edited since
 * keeps the edit. Retry safety (Principle VII, form (a)): compare-and-set, so a
 * replay finds nothing left to change.
 */
@Injectable()
@CommandHandler(RevertAssignmentCommand)
export class RevertAssignmentHandler extends BaseCommandHandler<
  RevertAssignmentCommand,
  customFields.RevertAssignmentResponse,
  Context
> {
  constructor(
    eventBus: EventBus,
    private readonly prisma: PrismaService,
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly fields: CustomFieldRepositoryPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly values: TransactionFieldValueRepositoryPort,
    @Inject(TRANSACTION_SCOPE_LOOKUP) private readonly movements: TransactionScopeLookupPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RevertAssignmentCommand): Promise<Context> {
    const { userId, body } = command;
    const field = await this.fields.findOwned(userId, command.fieldId);
    if (!field) throw new CustomFieldNotFoundError();
    const parse = (raw: customFields.CustomFieldValue | null) =>
      raw === null ? null : field.parseValue(raw, "restore");
    // Only the person's own movements: a foreign id in the body must never get a row.
    const owned = new Set(
      (
        await this.movements.factsFor(
          userId,
          body.restore.map((r) => r.transactionId),
        )
      ).map((f) => f.id),
    );
    return {
      field,
      applied: parse(body.appliedValue),
      restore: body.restore
        .filter((r) => owned.has(r.transactionId))
        .map((r) => ({ transactionId: r.transactionId, value: parse(r.value) })),
    };
  }

  protected async handle(
    command: RevertAssignmentCommand,
    { field, applied, restore }: Context,
  ): Promise<HandleResult<customFields.RevertAssignmentResponse>> {
    const result = await this.prisma.$transaction(
      (tx) => this.values.revertIfUnchangedWithTx(tx, command.userId, field, applied, restore),
      { timeout: 30_000 },
    );
    const kept = result.kept + (command.body.restore.length - restore.length);
    return { result: { restored: result.restored, kept }, events: [] };
  }
}
