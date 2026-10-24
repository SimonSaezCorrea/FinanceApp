import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { customFields } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  BANK_ACCOUNT_LOOKUP,
  type BankAccountLookupPort,
} from "../../../bank-account/domain/ports/bank-account-lookup.port";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  TRANSACTION_FIELD_VALUE_REPOSITORY,
  type TransactionFieldValueRepositoryPort,
} from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import {
  TRANSACTION_SCOPE_LOOKUP,
  type TransactionScopeLookupPort,
} from "../../../transaction/domain/ports/transaction-scope-lookup.port";
import { CustomField, type PlannedCustomField } from "../../domain/custom-field.aggregate";
import { CustomFieldLimitReachedError } from "../../domain/errors";
import {
  CUSTOM_FIELD_REPOSITORY,
  type CustomFieldRepositoryPort,
} from "../../domain/ports/custom-field.repository.port";
import { assertScopeAccountsOwned, scopeFilter } from "../scope";
import { CreateCustomFieldCommand } from "./custom-field.commands";

/** Upper bound on movements one "apply to existing" touches — every movement a
 * person has today fits several times over. */
const APPLY_EXISTING_MAX = 100_000;

interface Context {
  plan: PlannedCustomField;
  existingIds: string[];
}

/**
 * Creates a field (FR-001/002) and, when asked, gives its default to the movements
 * that already exist in its scope (FR-005), in the same transaction. Retry safety
 * (Principle VII, form (b)): the unique `(userId, nameKey)` makes a replay answer
 * `CUSTOM_FIELD_NAME_TAKEN` instead of creating a second field.
 */
@Injectable()
@CommandHandler(CreateCustomFieldCommand)
export class CreateCustomFieldHandler extends BaseCommandHandler<
  CreateCustomFieldCommand,
  customFields.CustomField,
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
    @Inject(BANK_ACCOUNT_LOOKUP) private readonly accounts: BankAccountLookupPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CreateCustomFieldCommand): Promise<Context> {
    const { userId, input } = command;
    const existing = await this.fields.listForUser(userId);
    if (existing.length >= customFields.CUSTOM_FIELD_MAX_FIELDS)
      throw new CustomFieldLimitReachedError();
    await assertScopeAccountsOwned(this.accounts, userId, input.scope);
    const sortOrder = existing.reduce((max, f) => Math.max(max, f.sortOrder + 1), 0);
    const plan = CustomField.planCreation(userId, input, sortOrder);
    const existingIds =
      input.applyDefaultToExisting && plan.defaultValue !== null
        ? await this.movements.idsInScope(
            userId,
            await scopeFilter(this.cards, userId, plan.scope),
            APPLY_EXISTING_MAX,
          )
        : [];
    return { plan, existingIds };
  }

  protected async handle(
    command: CreateCustomFieldCommand,
    { plan, existingIds }: Context,
  ): Promise<HandleResult<customFields.CustomField>> {
    const field = await this.prisma.$transaction(async (tx) => {
      const created = await this.fields.createWithTx(tx, plan);
      if (existingIds.length > 0 && plan.defaultValue !== null) {
        await this.values.setManyWithTx(
          tx,
          command.userId,
          { id: created.id, type: created.type },
          existingIds,
          plan.defaultValue,
        );
      }
      return created;
    });
    return { result: field.toContract(existingIds.length), events: [] };
  }
}
