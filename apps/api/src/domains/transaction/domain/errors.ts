/**
 * Domain errors: thrown by the aggregate/policy when an invariant is
 * violated — never a generic exception, never a duplicated check in a
 * handler/controller (FR-002). Presentation maps `code` to the identical
 * HTTP status the pre-migration `TransactionsService` threw (FR-015).
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: 400 | 404 = 400,
    public readonly field?: string,
  ) {
    super(code);
    this.name = new.target.name;
  }
}

export class TransactionNotFoundError extends DomainError {
  constructor() {
    super("TRANSACTION_NOT_FOUND", 404);
  }
}

export class AccountNotFoundError extends DomainError {
  constructor() {
    super("ACCOUNT_NOT_FOUND", 404);
  }
}

export class CardRequiredError extends DomainError {
  constructor() {
    super("CARD_REQUIRED");
  }
}

export class CardNotAllowedError extends DomainError {
  constructor() {
    super("CARD_NOT_ALLOWED");
  }
}

export class CardAccountMismatchError extends DomainError {
  constructor() {
    super("CARD_ACCOUNT_MISMATCH");
  }
}

export class CardLimitExceededError extends DomainError {
  constructor() {
    super("CARD_LIMIT_EXCEEDED");
  }
}

export class CardSubLimitExceededError extends DomainError {
  constructor() {
    super("CARD_SUBLIMIT_EXCEEDED");
  }
}
