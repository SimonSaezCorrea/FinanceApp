import type { movementTemplates } from "@finance/contracts";

import type { BankAccountLookupPort } from "../../bank-account/domain/ports/bank-account-lookup.port";
import type { CardAccountRepositoryPort } from "../../card-account/domain/ports/card-account.repository.port";
import { assertSelectableCategory } from "../../category/domain/category-policy";
import type { CategoryLookupPort } from "../../category/domain/ports/category-lookup.port";
import type { CustomFieldRepositoryPort } from "../../custom-field/domain/ports/custom-field.repository.port";
import type { RecurringExpenseRepositoryPort } from "../../recurring-expense/domain/ports/recurring-expense.repository.port";
import type { TemplateFieldValue } from "../domain/movement-template.aggregate";
import {
  TemplateAccountNotFoundError,
  TemplateCardNotFoundError,
  TemplateCustomFieldNotFoundError,
  TemplateRecurringNotFoundError,
} from "../domain/errors";

export interface TemplateReferencePorts {
  accounts: BankAccountLookupPort;
  cards: CardAccountRepositoryPort;
  categories: CategoryLookupPort;
  recurring: RecurringExpenseRepositoryPort;
  fields: CustomFieldRepositoryPort;
}

/**
 * Verifies every reference a save request carries BEFORE it is stored (Principle II):
 * the account, the card (the caller's AND on that account), the category (selectable
 * for the template's type), the recurring series and each custom field (the caller's,
 * with a value its field accepts). A foreign or unknown id answers 404, never
 * revealing that it exists. Returns the custom field values in their canonical form.
 *
 * Whether a custom field APPLIES to the movement isn't checked: a template may name no
 * account, and the form decides that when the template is used (FR-011).
 */
export async function verifyTemplateReferences(
  ports: TemplateReferencePorts,
  userId: string,
  input: movementTemplates.SaveMovementTemplate,
): Promise<Record<string, TemplateFieldValue>> {
  if (input.bankAccountId && !(await ports.accounts.accountOwned(userId, input.bankAccountId)))
    throw new TemplateAccountNotFoundError();
  if (input.cardId) {
    const card = input.bankAccountId
      ? await ports.cards.findOnAccount(userId, input.bankAccountId, input.cardId)
      : null;
    if (!card) throw new TemplateCardNotFoundError();
  }
  await assertSelectableCategory(ports.categories, input.categoryId, input.type);
  if (
    input.recurringExpenseId &&
    !(await ports.recurring.findOne(userId, input.recurringExpenseId))
  )
    throw new TemplateRecurringNotFoundError();

  const entries = Object.entries(input.customFields ?? {});
  if (entries.length === 0) return {};
  const owned = new Map((await ports.fields.listForUser(userId)).map((f) => [f.id, f]));
  const values: Record<string, TemplateFieldValue> = {};
  for (const [fieldId, raw] of entries) {
    const field = owned.get(fieldId);
    if (!field) throw new TemplateCustomFieldNotFoundError(fieldId);
    values[fieldId] = field.parseValue(raw);
  }
  return values;
}
