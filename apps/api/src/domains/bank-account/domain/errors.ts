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
