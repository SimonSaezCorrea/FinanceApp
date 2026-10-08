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

/** A prepago (spec 019) was attempted against a period that isn't the account's
 * currently OPEN one — either it already closed, or it belongs to another
 * account. Defense in depth: the UI should never offer this in the first place. */
export class StatementNotOpenError extends DomainError {
  constructor() {
    super("STATEMENT_NOT_OPEN", 409);
  }
}

/** An inactive account (or one whose relevant card is inactive/removed) does
 * not generate new billing — it's left accumulating instead of being closed. */
export class AccountInactiveError extends DomainError {
  constructor() {
    super("ACCOUNT_INACTIVE");
  }
}

/** Spec 028: transfer offered only for a closed, overdue, unsettled period in
 * another currency (`accounts.canTransferStatement`). */
export class StatementNotTransferableError extends DomainError {
  constructor() {
    super("STATEMENT_NOT_TRANSFERABLE", 409);
  }
}

/** Spec 028: undoing a transfer needs a TRANSFERRED period. */
export class StatementNotTransferredError extends DomainError {
  constructor() {
    super("STATEMENT_NOT_TRANSFERRED", 409);
  }
}

/** Spec 028 (research R9): the account-currency period that received the transfer's
 * charge is already settled — undoing it would rewrite a paid period. */
export class TransferAlreadyBilledError extends DomainError {
  constructor() {
    super("TRANSFER_ALREADY_BILLED", 409);
  }
}

/** Spec 028: paying a statement in another currency from an account in yet another
 * one needs what left that account too — the two are never compared. */
export class StatementPaymentCurrencyAmbiguousError extends DomainError {
  constructor() {
    super("STATEMENT_PAYMENT_CURRENCY_AMBIGUOUS", 400, "chargedAmount");
  }
}

/** "Generar facturación" on an account that can't be billed: not a credit card
 * account, inactive, or without an active primary credit card. */
export class StatementGenerationNotAllowedError extends DomainError {
  constructor() {
    super("STATEMENT_GENERATION_NOT_ALLOWED");
  }
}

/** The declared start falls before the account's last close: two periods would
 * claim the same days (and the same movements). */
export class StatementPeriodOverlapsError extends DomainError {
  constructor() {
    super("STATEMENT_PERIOD_OVERLAPS", 400);
  }
}

/** Close not after start, or due date before close. */
export class StatementDatesInvalidError extends DomainError {
  constructor() {
    super("STATEMENT_DATES_INVALID", 400);
  }
}

/** Editing the dates of a period that hasn't been generated yet (still OPEN). */
export class StatementNotClosedError extends DomainError {
  constructor() {
    super("STATEMENT_NOT_CLOSED", 409);
  }
}

/** Moving the start/close of a settled period (its money already moved), or the
 * close of one that is followed by another closed period. */
export class StatementDatesLockedError extends DomainError {
  constructor() {
    super("STATEMENT_DATES_LOCKED", 409);
  }
}
