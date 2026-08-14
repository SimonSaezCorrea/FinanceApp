import { DomainError } from "../../../infra/domain/domain-error";

/**
 * Errors of the `bank-account` table's aggregate (which also guards its
 * `card-account`/`card-limit`/`billing-settings` children). The aggregate throws
 * these when an invariant is violated — never a generic exception, never a
 * duplicated check in a handler or controller (FR-002). `AllExceptionsFilter`
 * maps `code`/`httpStatus` to the same HTTP responses the API returned before
 * the migrations, so external behavior is unchanged (FR-015).
 */
export { DomainError };

export class AccountNotFoundError extends DomainError {
  constructor() {
    super("ACCOUNT_NOT_FOUND", 404);
  }
}

export class CardNotFoundError extends DomainError {
  constructor() {
    super("CARD_NOT_FOUND", 404);
  }
}

export class AccountNumberRequiredError extends DomainError {
  constructor() {
    super("ACCOUNT_NUMBER_REQUIRED", 400, "accountNumber");
  }
}

export class AccountCannotHaveCardError extends DomainError {
  constructor() {
    super("ACCOUNT_CANNOT_HAVE_CARD");
  }
}

export class CardLimitRequiredError extends DomainError {
  constructor() {
    super("CARD_LIMIT_REQUIRED");
  }
}

export class CardSubLimitExceedsAccountError extends DomainError {
  constructor() {
    super("CARD_SUBLIMIT_EXCEEDS_ACCOUNT");
  }
}

/** A prepaid balance sent for a CREDIT/DEBIT card: those have no pot of their own
 * (a debit card spends the account's balance, a credit one draws on the pool), so
 * the figure is rejected rather than silently dropped. */
export class PrepaidBalanceNotAllowedError extends DomainError {
  constructor() {
    super("PREPAID_BALANCE_NOT_ALLOWED");
  }
}

/** A negative starting balance on a prepaid card — it is money held, not credit. */
export class InvalidPrepaidBalanceError extends DomainError {
  constructor() {
    super("INVALID_PREPAID_BALANCE");
  }
}
