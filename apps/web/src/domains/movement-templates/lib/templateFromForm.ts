import { accounts as accountsContract } from "@finance/contracts";
import type { accounts, customFields, movementTemplates } from "@finance/contracts";

import { creationPayload, shapeOf } from "../../custom-fields/lib/fieldValues";
import type { TransactionFormValue } from "../../transactions/components/TransactionFormPanel";

const text = (v: string): string | undefined => (v.trim() ? v.trim() : undefined);

/**
 * The template a movement form describes (specs/037): everything but the date. Only an
 * income or an expense makes one. The amount is kept only when asked (`keepAmount`) and
 * there is one; a card only where the form would send it (an expense on an account that
 * carries cards, never with an issuer charge); custom field values only for the fields
 * that apply to what the form describes.
 */
export function templateFromForm(
  form: TransactionFormValue,
  opts: {
    name: string;
    keepAmount: boolean;
    accounts: readonly accounts.BankAccount[];
    fields: readonly customFields.CustomField[];
    /** What the form's custom fields show (its own values, or the defaults). */
    fieldValues: Record<string, customFields.CustomFieldValue>;
  },
): movementTemplates.SaveMovementTemplate {
  const type = form.mode === "INCOME" ? "INCOME" : "EXPENSE";
  const account = opts.accounts.find((a) => a.id === form.bankAccountId);
  const cardable = !!account && accountsContract.isCardableAccountType(account.type);
  const financeCharge = type === "EXPENSE" && account?.type === "CREDIT_CARD" && form.financeCharge;
  const cardId =
    type === "EXPENSE" && cardable && !financeCharge && form.cardId ? form.cardId : undefined;
  const amount = form.amount.replace(/\.$/, "");
  const hasAmount = opts.keepAmount && /[1-9]/.test(amount);

  const values = creationPayload(
    opts.fields,
    shapeOf(
      { type, bankAccountId: form.bankAccountId || null, cardId: cardId ?? null },
      opts.accounts,
    ),
    opts.fieldValues,
  );
  const customFields = Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, customFields.CustomFieldValue] => entry[1] !== null,
    ),
  );

  return {
    name: opts.name.trim(),
    type,
    ...(hasAmount ? { amount, currency: form.currency } : {}),
    bankAccountId: form.bankAccountId || undefined,
    cardId,
    categoryId: form.categoryId || undefined,
    recurringExpenseId: form.recurringExpenseId || undefined,
    description: text(form.description),
    observation: text(form.observation),
    emisor: text(form.emisor),
    receptor: text(form.receptor),
    lugar: text(form.lugar),
    financeCharge: financeCharge || undefined,
    customFields,
  };
}
