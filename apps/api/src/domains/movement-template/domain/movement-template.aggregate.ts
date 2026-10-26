import { movementTemplates } from "@finance/contracts";
import type { customFields, transactions } from "@finance/contracts";

import { MovementTemplateInvalidError } from "./errors";

export type TemplateFieldValue = customFields.CustomFieldValue;

/** What a template holds besides its identity. Every reference is optional. */
export interface MovementTemplateState {
  name: string;
  nameKey: string;
  type: transactions.TransactionType;
  amount: string | null;
  currency: string | null;
  bankAccountId: string | null;
  cardId: string | null;
  categoryId: string | null;
  recurringExpenseId: string | null;
  description: string | null;
  observation: string | null;
  emisor: string | null;
  receptor: string | null;
  lugar: string | null;
  financeCharge: boolean;
  customFieldValues: Record<string, TemplateFieldValue>;
}

export interface MovementTemplateProps extends MovementTemplateState {
  id: string;
  userId: string;
}

export type PlannedMovementTemplate = MovementTemplateState & { userId: string };

const blankToNull = (v: string | undefined): string | null => {
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
};

/**
 * The state a save request describes, with the template's invariants enforced. The
 * contract refines say the same; this is what holds for a command built any other
 * way. `customFieldValues` arrive already parsed by each field (`template-references`).
 */
function stateFrom(
  input: movementTemplates.SaveMovementTemplate,
  customFieldValues: Record<string, TemplateFieldValue>,
): MovementTemplateState {
  const name = input.name.trim();
  if (!name || name.length > movementTemplates.MOVEMENT_TEMPLATE_NAME_MAX)
    throw new MovementTemplateInvalidError("name");
  const financeCharge = input.financeCharge ?? false;
  const cardId = input.cardId ?? null;
  const bankAccountId = input.bankAccountId ?? null;
  const amount = input.amount ?? null;
  const currency = input.currency ? input.currency.trim().toUpperCase() : null;
  if (cardId && !bankAccountId) throw new MovementTemplateInvalidError("cardId");
  if (financeCharge && (input.type !== "EXPENSE" || cardId))
    throw new MovementTemplateInvalidError("financeCharge");
  if (amount !== null && !currency) throw new MovementTemplateInvalidError("currency");
  return {
    name,
    nameKey: movementTemplates.normalizeTemplateName(name),
    type: input.type,
    amount,
    currency,
    bankAccountId,
    cardId,
    categoryId: input.categoryId ?? null,
    recurringExpenseId: input.recurringExpenseId ?? null,
    description: blankToNull(input.description),
    observation: blankToNull(input.observation),
    emisor: blankToNull(input.emisor),
    receptor: blankToNull(input.receptor),
    lugar: blankToNull(input.lugar),
    financeCharge,
    customFieldValues,
  };
}

/**
 * A reusable movement a person keeps for what they record often (specs/037). It is
 * its own aggregate: created, replaced and deleted without any movement changing —
 * using it only pre-fills the movement form.
 */
export class MovementTemplate {
  private constructor(private props: MovementTemplateProps) {}

  static fromPersistence(props: MovementTemplateProps): MovementTemplate {
    return new MovementTemplate(props);
  }

  static planCreation(
    userId: string,
    input: movementTemplates.SaveMovementTemplate,
    customFieldValues: Record<string, TemplateFieldValue>,
  ): PlannedMovementTemplate {
    return { userId, ...stateFrom(input, customFieldValues) };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get nameKey(): string {
    return this.props.nameKey;
  }

  /** A `PUT`: the whole state is replaced by what the request describes. */
  replace(
    input: movementTemplates.SaveMovementTemplate,
    customFieldValues: Record<string, TemplateFieldValue>,
  ): void {
    this.props = {
      id: this.props.id,
      userId: this.props.userId,
      ...stateFrom(input, customFieldValues),
    };
  }

  toProps(): MovementTemplateProps {
    return { ...this.props, customFieldValues: { ...this.props.customFieldValues } };
  }

  /**
   * The contract shape. `existingFieldIds` are the person's custom fields today: a
   * value for a field deleted since is dropped here (the template degrades, FR-011).
   */
  toContract(existingFieldIds: ReadonlySet<string>): movementTemplates.MovementTemplate {
    const p = this.props;
    const values: Record<string, TemplateFieldValue> = {};
    for (const [fieldId, value] of Object.entries(p.customFieldValues)) {
      if (existingFieldIds.has(fieldId)) values[fieldId] = value;
    }
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      amount: p.amount,
      currency: p.currency,
      bankAccountId: p.bankAccountId,
      cardId: p.cardId,
      categoryId: p.categoryId,
      recurringExpenseId: p.recurringExpenseId,
      description: p.description,
      observation: p.observation,
      emisor: p.emisor,
      receptor: p.receptor,
      lugar: p.lugar,
      financeCharge: p.financeCharge,
      customFields: values,
    };
  }
}
