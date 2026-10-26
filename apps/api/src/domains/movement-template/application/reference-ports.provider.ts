import { Inject, Injectable } from "@nestjs/common";

import {
  BANK_ACCOUNT_LOOKUP,
  type BankAccountLookupPort,
} from "../../bank-account/domain/ports/bank-account-lookup.port";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../card-account/domain/ports/card-account.repository.port";
import {
  CATEGORY_LOOKUP,
  type CategoryLookupPort,
} from "../../category/domain/ports/category-lookup.port";
import {
  CUSTOM_FIELD_REPOSITORY,
  type CustomFieldRepositoryPort,
} from "../../custom-field/domain/ports/custom-field.repository.port";
import {
  RECURRING_EXPENSE_REPOSITORY,
  type RecurringExpenseRepositoryPort,
} from "../../recurring-expense/domain/ports/recurring-expense.repository.port";
import type { TemplateReferencePorts } from "./template-references";

/** The other tables' ports a template's references are checked against, injected once
 * and shared by the create and replace handlers. */
@Injectable()
export class TemplateReferencePortsProvider implements TemplateReferencePorts {
  constructor(
    @Inject(BANK_ACCOUNT_LOOKUP) readonly accounts: BankAccountLookupPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) readonly cards: CardAccountRepositoryPort,
    @Inject(CATEGORY_LOOKUP) readonly categories: CategoryLookupPort,
    @Inject(RECURRING_EXPENSE_REPOSITORY) readonly recurring: RecurringExpenseRepositoryPort,
    @Inject(CUSTOM_FIELD_REPOSITORY) readonly fields: CustomFieldRepositoryPort,
  ) {}
}
