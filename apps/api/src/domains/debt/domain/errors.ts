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
