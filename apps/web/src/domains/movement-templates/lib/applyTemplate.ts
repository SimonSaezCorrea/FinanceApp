import { accounts as accountsContract, customFields, reference } from "@finance/contracts";
import type { accounts, movementTemplates } from "@finance/contracts";

import { amountToInput } from "../../../shared/lib/amountInput";
import { defaultCardId, selectableCards } from "../../accounts/lib/selectableCards";
import { defaultsFor, scopeRule, shapeOf } from "../../custom-fields/lib/fieldValues";
import type { TransactionFormValue } from "../../transactions/components/TransactionFormPanel";

export interface ApplyTemplateContext {
  /** Every account of the person (to read cards and types). */
  accounts: readonly accounts.BankAccount[];
  /** The accounts the form offers (active ones): a template's account outside it is
   * left for the person to pick. */
  selectableIds: ReadonlySet<string>;
  /** The form was opened from inside one account: that account stays. */
  lockedAccountId?: string;
  categories: readonly reference.Category[];
  recurringIds: ReadonlySet<string>;
  fields: readonly customFields.CustomField[];
  /** What the form holds before the template (its date and currency stay as they are
   * when the template doesn't say otherwise). */
  current: TransactionFormValue;
  /** Start from the applying fields' defaults (using a template on a new movement).
   * Off when editing the template itself: it holds only what the person set. */
  withDefaults?: boolean;
}

/**
 * What using a template does to the movement form (specs/037): every field it holds,
 * EXCEPT what no longer fits — an account that's gone or inactive, a card that isn't on
 * the chosen account, a category not selectable for the type, a deleted series, a
 * custom field that's gone, changed or doesn't apply. Those are left empty (FR-011),
 * never an error. The date is never touched (it stays today). Pure: the form keeps
 * every value editable afterwards, and nothing is created until the person saves.
 */
export function applyTemplate(
  template: movementTemplates.MovementTemplate,
  ctx: ApplyTemplateContext,
): TransactionFormValue {
  const accountId =
    ctx.lockedAccountId ??
    (template.bankAccountId && ctx.selectableIds.has(template.bankAccountId)
      ? template.bankAccountId
      : "");
  const account = ctx.accounts.find((a) => a.id === accountId);
  const isCreditCard = account?.type === "CREDIT_CARD";
  // A credit card account only takes an expense in the form — same rule as picking it.
  const mode = isCreditCard ? "EXPENSE" : template.type;
  const financeCharge = mode === "EXPENSE" && isCreditCard && template.financeCharge;
  const cardable = !!account && accountsContract.isCardableAccountType(account.type);
  const templateCard =
    mode === "EXPENSE" && cardable && !financeCharge
      ? selectableCards(account).find((c) => c.id === template.cardId)
      : undefined;
  // A credit card account's expense always goes through a card: its primary one
  // (or another active one when the template's card was deactivated).
  const cardId = templateCard?.id ?? (isCreditCard && !financeCharge ? defaultCardId(account) : "");

  const category = ctx.categories.find((c) => c.id === template.categoryId);
  const categoryId = category && reference.isCategorySelectable(category, mode) ? category.id : "";
  const recurringExpenseId =
    template.recurringExpenseId && ctx.recurringIds.has(template.recurringExpenseId)
      ? template.recurringExpenseId
      : "";

  const currency = account?.currency ?? template.currency ?? ctx.current.currency;
  const shape = shapeOf(
    { type: mode, bankAccountId: accountId || null, cardId: cardId || null },
    ctx.accounts,
  );
  // The defaults that apply, then what the template holds — when it still fits.
  const values = ctx.withDefaults === false ? {} : defaultsFor(ctx.fields, shape);
  for (const [fieldId, raw] of Object.entries(template.customFields)) {
    const field = ctx.fields.find((f) => f.id === fieldId);
    if (!field || !customFields.fieldAppliesTo(scopeRule(field), shape)) continue;
    const parsed = customFields.parseFieldValue(field, raw);
    if (parsed.ok) values[fieldId] = parsed.value;
  }

  return {
    ...ctx.current,
    mode,
    amount: template.amount ? amountToInput(template.amount) : "",
    currency,
    bankAccountId: accountId,
    cardId,
    financeCharge,
    categoryId,
    recurringExpenseId,
    // A template without a description records its name: that's what the person called it.
    // Editing the template keeps the field as it was saved.
    description: template.description ?? (ctx.withDefaults === false ? "" : template.name),
    observation: template.observation ?? "",
    emisor: template.emisor ?? "",
    receptor: template.receptor ?? "",
    lugar: template.lugar ?? "",
    customFields: values,
  };
}
