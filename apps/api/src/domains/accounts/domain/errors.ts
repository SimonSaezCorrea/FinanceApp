/**
 * Domain errors: the aggregate throws these when an invariant is violated —
 * never a generic exception, never a duplicated check in a service/controller
 * (FR-002). The presentation layer maps `code` to the identical HTTP status
 * codes the pre-migration `AccountsService`/`CardsService` threw, so external
 * API behavior is unchanged (FR-015).
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

export class StatementNotFoundError extends DomainError {
  constructor() {
    super("STATEMENT_NOT_FOUND", 404);
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

/** A CreditStatement that's already PAID cannot be paid again (State pattern). */
export class StatementAlreadyPaidError extends DomainError {
  constructor() {
    super("STATEMENT_ALREADY_PAID");
  }
}

/** Only a PAID statement's frozen amount may be corrected (State pattern). */
export class StatementNotPaidError extends DomainError {
  constructor() {
    super("STATEMENT_NOT_PAID");
  }
}

export class InvalidPaymentSourceError extends DomainError {
  constructor() {
    super("INVALID_PAYMENT_SOURCE");
  }
}

export class NothingToPayError extends DomainError {
  constructor() {
    super("NOTHING_TO_PAY");
  }
}

/** An inactive account (or one whose relevant card is inactive/removed) does
 * not generate new billing — it's left accumulating instead of being closed. */
export class AccountInactiveError extends DomainError {
  constructor() {
    super("ACCOUNT_INACTIVE");
  }
}
