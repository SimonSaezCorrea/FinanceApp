import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { customFields } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BANK_ACCOUNT_LOOKUP,
  type BankAccountLookupPort,
} from "../../../bank-account/domain/ports/bank-account-lookup.port";
import {
  TRANSACTION_FIELD_VALUE_REPOSITORY,
  type TransactionFieldValueRepositoryPort,
} from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import type { CustomField } from "../../domain/custom-field.aggregate";
import { CustomFieldNotFoundError } from "../../domain/errors";
import {
  CUSTOM_FIELD_REPOSITORY,
  type CustomFieldRepositoryPort,
} from "../../domain/ports/custom-field.repository.port";
import { assertScopeAccountsOwned } from "../scope";
import { UpdateCustomFieldCommand } from "./custom-field.commands";

interface Context {
  field: CustomField;
  valueCount: number;
  usedOptionIds: Set<string>;
}

/**
 * Edits a field (FR-004): name, scope, default, options and "mostrar como columna"
 * always; the type only while no movement holds a value. Values already stored are
 * never deleted nor filled in by a scope change. Retry safety (Principle VII, form
 * (b)): it writes the field's absolute state on its own row — repeating it changes
 * nothing.
 */
@Injectable()
@CommandHandler(UpdateCustomFieldCommand)
export class UpdateCustomFieldHandler extends BaseCommandHandler<
  UpdateCustomFieldCommand,
  customFields.CustomField,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly fields: CustomFieldRepositoryPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly values: TransactionFieldValueRepositoryPort,
    @Inject(BANK_ACCOUNT_LOOKUP) private readonly accounts: BankAccountLookupPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateCustomFieldCommand): Promise<Context> {
    const field = await this.fields.findOwned(command.userId, command.id);
    if (!field) throw new CustomFieldNotFoundError();
    await assertScopeAccountsOwned(this.accounts, command.userId, command.patch.scope);
    const [counts, usedOptionIds] = await Promise.all([
      this.values.countByField(command.userId),
      field.type === "OPTION"
        ? this.values.usedOptionIds(command.userId, field.id)
        : Promise.resolve(new Set<string>()),
    ]);
    return { field, valueCount: counts.get(field.id) ?? 0, usedOptionIds };
  }

  protected async handle(
    command: UpdateCustomFieldCommand,
    { field, valueCount, usedOptionIds }: Context,
  ): Promise<HandleResult<customFields.CustomField>> {
    field.applyUpdate(command.patch, { valueCount, usedOptionIds });
    await this.fields.save(field);
    return { result: field.toContract(valueCount), events: [] };
  }
}
