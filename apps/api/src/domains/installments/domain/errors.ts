/**
 * Domain errors: thrown by the aggregate when an invariant is violated —
 * never a generic exception, never a duplicated check in a handler/controller
 * (FR-002). Presentation maps `code` to the identical HTTP status the
 * pre-migration `InstallmentsService` threw (FR-015).
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

export class InstallmentPlanNotFoundError extends DomainError {
  constructor() {
    super("INSTALLMENT_PLAN_NOT_FOUND", 404);
  }
}

export class InstallmentPaymentNotFoundError extends DomainError {
  constructor() {
    super("INSTALLMENT_PAYMENT_NOT_FOUND", 404);
  }
}
