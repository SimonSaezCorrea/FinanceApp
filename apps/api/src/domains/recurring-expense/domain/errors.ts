/**
 * Domain errors: thrown when an invariant is violated — never a generic
 * exception, never a duplicated check in a handler/controller (FR-002).
 * Presentation maps `code` to the identical HTTP status the pre-migration
 * `RecurringService` threw (FR-015): `NotFound` (404) via
 * `NotFoundException`.
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

export class RecurringExpenseNotFoundError extends DomainError {
  constructor() {
    super("RECURRING_NOT_FOUND", 404);
  }
}
