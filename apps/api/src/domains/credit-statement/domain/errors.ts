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
