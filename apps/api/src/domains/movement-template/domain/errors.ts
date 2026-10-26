/**
 * Domain errors of movement templates (specs/037). The API answers `code` (and
 * `field`) with `httpStatus`; the web maps the code to `errors.<CODE>` in es/en.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: 400 | 404 | 409 = 400,
    public readonly field?: string,
  ) {
    super(code);
    this.name = new.target.name;
  }
}

/** Unknown, or not the caller's own (never 403: Principle II). */
export class MovementTemplateNotFoundError extends DomainError {
  constructor() {
    super("MOVEMENT_TEMPLATE_NOT_FOUND", 404);
  }
}

export class MovementTemplateNameTakenError extends DomainError {
  constructor() {
    super("MOVEMENT_TEMPLATE_NAME_TAKEN", 409, "name");
  }
}

/** A person already has `MOVEMENT_TEMPLATE_MAX` templates. */
export class MovementTemplateLimitReachedError extends DomainError {
  constructor() {
    super("MOVEMENT_TEMPLATE_LIMIT_REACHED", 409);
  }
}

/** One of the template's invariants doesn't hold (the contract refines mirror them). */
export class MovementTemplateInvalidError extends DomainError {
  constructor(field: string) {
    super("VALIDATION_FAILED", 400, field);
  }
}

/** A referenced account that isn't the caller's own. */
export class TemplateAccountNotFoundError extends DomainError {
  constructor() {
    super("ACCOUNT_NOT_FOUND", 404, "bankAccountId");
  }
}

/** A card that isn't the caller's, or isn't on the template's account. */
export class TemplateCardNotFoundError extends DomainError {
  constructor() {
    super("CARD_NOT_FOUND", 404, "cardId");
  }
}

export class TemplateRecurringNotFoundError extends DomainError {
  constructor() {
    super("RECURRING_NOT_FOUND", 404, "recurringExpenseId");
  }
}

export class TemplateCustomFieldNotFoundError extends DomainError {
  constructor(fieldId: string) {
    super("CUSTOM_FIELD_NOT_FOUND", 404, `customFields.${fieldId}`);
  }
}
