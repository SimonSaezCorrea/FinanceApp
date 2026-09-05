/**
 * Domain errors: thrown by the `Debt` aggregate when an invariant is
 * violated — never a generic exception, never a duplicated check in a
 * handler/controller (FR-002). Presentation maps `code` to the identical
 * HTTP status the pre-migration `DebtsService` threw (FR-015): `NotFound`
 * (404) via `NotFoundException`, the rest (409) via `ConflictException`.
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

export class DebtNotFoundError extends DomainError {
  constructor() {
    super("DEBT_NOT_FOUND", 404);
  }
}

export class DebtAlreadySettledError extends DomainError {
  constructor() {
    super("DEBT_ALREADY_SETTLED", 409);
  }
}

export class AllInstallmentsPaidError extends DomainError {
  constructor() {
    super("ALL_INSTALLMENTS_PAID", 409);
  }
}

export class DebtNotSettledError extends DomainError {
  constructor() {
    super("DEBT_NOT_SETTLED", 409);
  }
}

export class NoPaymentsToUndoError extends DomainError {
  constructor() {
    super("NO_PAYMENTS_TO_UNDO", 409);
  }
}

/** A patch would leave `totalInstallments` below what is already paid — a
 * schedule can shrink, but never past what already happened. */
export class TotalInstallmentsBelowPaidError extends DomainError {
  constructor() {
    super("TOTAL_INSTALLMENTS_BELOW_PAID", 409, "totalInstallments");
  }
}

/** The paying account's currency differs from the debt's own — this app has
 * no FX conversion anywhere, so there is no honest single amount to move. */
export class DebtPaymentCurrencyMismatchError extends DomainError {
  constructor() {
    super("DEBT_PAYMENT_CURRENCY_MISMATCH", 409);
  }
}

/** Settling debt with debt: a CREDIT_CARD account has no cash of its own to
 * move — same rule a transfer and an instalment payment already apply to a
 * credit destination/source. */
export class DebtPaymentFromCreditAccountError extends DomainError {
  constructor() {
    super("DEBT_PAYMENT_FROM_CREDIT_ACCOUNT", 409);
  }
}
