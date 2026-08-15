/**
 * Domain errors: thrown by the aggregate/policy when an invariant is
 * violated — never a generic exception, never a duplicated check in a
 * handler/controller (FR-002). Presentation maps `code` to the identical
 * HTTP status the pre-migration `TransactionsService` threw (FR-015).
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

/** A `cursor` query param that isn't a cursor this API issued. Rejected rather
 * than ignored: silently restarting from page one would make a paginating
 * client re-request the same page forever. */
export class InvalidCursorError extends DomainError {
  constructor() {
    super("INVALID_CURSOR", 400, "cursor");
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

/** Transfers (`TransferPolicy`). */

export class TransferSameAccountError extends DomainError {
  constructor() {
    super("TRANSFER_SAME_ACCOUNT", 400, "toBankAccountId");
  }
}

/** Money doesn't land in a credit line: settling one is a statement payment,
 * which has its own flow and its own accounting. */
export class TransferToCreditAccountError extends DomainError {
  constructor() {
    super("TRANSFER_TO_CREDIT_ACCOUNT", 400, "toBankAccountId");
  }
}

export class TransferAccountNotFoundError extends DomainError {
  constructor() {
    super("TRANSFER_ACCOUNT_NOT_FOUND", 404);
  }
}

export class TransferNotFoundError extends DomainError {
  constructor() {
    super("TRANSFER_NOT_FOUND", 404);
  }
}

/** Editing one leg of a transfer: it is edited as a pair, by its own endpoint. */
export class TransferEditAsPairError extends DomainError {
  constructor() {
    super("TRANSFER_EDIT_AS_PAIR", 409);
  }
}

export class InvalidAmountError extends DomainError {
  constructor() {
    super("INVALID_AMOUNT", 400, "amount");
  }
}

/** An expense through a PREPAID card bigger than what the card holds. A prepaid
 * card declines instead of lending, so this is rejected, never allowed negative. */
export class PrepaidInsufficientBalanceError extends DomainError {
  constructor() {
    super("PREPAID_INSUFFICIENT_BALANCE");
  }
}

/** The movement would push the account past the overdraft line it was granted.
 * Only ever thrown when a line IS configured: without one the app has no basis
 * to refuse a movement that really happened. */
export class OverdraftLimitExceededError extends DomainError {
  constructor() {
    super("OVERDRAFT_LIMIT_EXCEEDED", 400, "amount");
  }
}

/** The income would push the account past the maximum balance it may hold (a
 * CuentaRUT or a prepaid account under its regulatory cap). Only thrown when a
 * ceiling is declared. */
export class BalanceCeilingExceededError extends DomainError {
  constructor() {
    super("BALANCE_CEILING_EXCEEDED", 400, "amount");
  }
}
