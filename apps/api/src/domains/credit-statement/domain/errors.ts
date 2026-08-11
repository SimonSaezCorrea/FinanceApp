import { DomainError } from "../../../infra/domain/domain-error";

/** Errors of the `credit-statement` table's aggregate and its State objects. */
export { DomainError };

export class StatementNotFoundError extends DomainError {
  constructor() {
    super("STATEMENT_NOT_FOUND", 404);
  }
}

/** A statement that's already PAID cannot be paid again (State pattern). */
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

/** A payment bigger than what the period still owes. Rejected instead of being
 * capped: a wrong figure in a money form must never be quietly "corrected". */
export class PaymentExceedsRemainingError extends DomainError {
  constructor() {
    super("PAYMENT_EXCEEDS_REMAINING");
  }
}

/** A payment of zero or less. */
export class InvalidPaymentAmountError extends DomainError {
  constructor() {
    super("INVALID_PAYMENT_AMOUNT");
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
