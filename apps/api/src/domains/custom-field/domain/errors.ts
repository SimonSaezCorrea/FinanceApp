/**
 * Domain errors of custom fields (specs/036): thrown when an invariant is violated.
 * The API answers `code` (and `field`) with `httpStatus`; the web maps the code to
 * `errors.<CODE>` in es/en.
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

export class CustomFieldNotFoundError extends DomainError {
  constructor() {
    super("CUSTOM_FIELD_NOT_FOUND", 404);
  }
}

export class CustomFieldNameTakenError extends DomainError {
  constructor() {
    super("CUSTOM_FIELD_NAME_TAKEN", 409, "name");
  }
}

/** A person already has `CUSTOM_FIELD_MAX_FIELDS` fields. */
export class CustomFieldLimitReachedError extends DomainError {
  constructor() {
    super("CUSTOM_FIELD_LIMIT_REACHED", 409);
  }
}

/** The type can't change once a movement holds a value (FR-004). */
export class CustomFieldTypeLockedError extends DomainError {
  constructor() {
    super("CUSTOM_FIELD_TYPE_LOCKED", 409, "type");
  }
}

/** A list option can be removed only while no movement uses it. */
export class CustomFieldOptionInUseError extends DomainError {
  constructor() {
    super("CUSTOM_FIELD_OPTION_IN_USE", 409, "options");
  }
}

/** A value (or a default) that doesn't fit the field's type or options. */
export class CustomFieldInvalidValueError extends DomainError {
  constructor(field?: string) {
    super("CUSTOM_FIELD_INVALID_VALUE", 400, field);
  }
}

/** A value for a field that doesn't apply to that movement (and it held none). */
export class CustomFieldNotApplicableError extends DomainError {
  constructor(field?: string) {
    super("CUSTOM_FIELD_NOT_APPLICABLE", 400, field);
  }
}

/** A bulk action resolved to more than `CUSTOM_FIELD_ASSIGNMENT_MAX` movements. */
export class CustomFieldAssignmentTooLargeError extends DomainError {
  constructor() {
    super("CUSTOM_FIELD_ASSIGNMENT_TOO_LARGE", 400, "target");
  }
}

/** A movement filter that names a field but no predicate, or one that doesn't fit it. */
export class CustomFieldFilterInvalidError extends DomainError {
  constructor() {
    super("CUSTOM_FIELD_FILTER_INVALID", 400, "cf");
  }
}

/** An account in the scope that isn't the person's own (Principle II). */
export class CustomFieldAccountNotFoundError extends DomainError {
  constructor() {
    super("ACCOUNT_NOT_FOUND", 404, "scope.accountIds");
  }
}

/** The movement doesn't exist or isn't the person's own (never 403: Principle II). */
export class CustomFieldTransactionNotFoundError extends DomainError {
  constructor() {
    super("TRANSACTION_NOT_FOUND", 404);
  }
}
